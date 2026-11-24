import { schema } from "@english/database";
import { asc, eq } from "drizzle-orm";
import { authorize } from "../auth/actor";
import { notFound } from "../errors";
import type { GraphQLContext } from "../context";
import type { Resolvers } from "../generated/resolvers";
import type { PublishedResourceModel } from "../models";
import * as editorial from "../modules/resources/editorial";
import { publishedResources, resourceBySlug } from "../modules/resources/public";
import { exerciseSetsForEditing } from "../modules/assessment/service";
import type { ExerciseSetInput } from "../modules/assessment/schemas";
import { tagsForResource } from "../modules/revalidate";
import { readingSeconds, wordCount } from "../modules/rich-text";
import { invalid } from "../errors";
import { present } from "../rows";

const TYPE_BY_KIND = {
  READING: "ReadingResource",
  LISTENING: "ListeningResource",
  LEXICAL_COLLECTION: "LexicalCollectionResource",
  ARTICLE: "ArticleResource",
} as const;

/** The fields every published resource has. All come from the one frozen revision. */
const common = {
  id: (p: PublishedResourceModel) => p.resource.id,
  kind: (p: PublishedResourceModel) => p.resource.kind,
  locale: (p: PublishedResourceModel) => p.localization.locale,
  slug: (p: PublishedResourceModel) => p.localization.slug,
  title: (p: PublishedResourceModel) => p.revision.title,
  summary: (p: PublishedResourceModel) => p.revision.summary,
  cefrLevel: (p: PublishedResourceModel) => p.revision.cefrLevel,
  body: (p: PublishedResourceModel) => p.revision.richText,
  revisionNo: (p: PublishedResourceModel) => p.revision.revisionNo,
  publishedAt: (p: PublishedResourceModel) => present(p.revision.publishedAt, "publishedAt"),
  topics: (p: PublishedResourceModel, _: unknown, ctx: GraphQLContext) =>
    ctx.loaders.topicsByRevision.load(p.revision.id),
  examLabels: (p: PublishedResourceModel, _: unknown, ctx: GraphQLContext) =>
    ctx.loaders.examLabelsByRevision.load(p.revision.id),
  exerciseSets: (p: PublishedResourceModel, _: unknown, ctx: GraphQLContext) =>
    ctx.loaders.exerciseSetsByRevision.load(p.revision.id),
};

async function editorialResource(ctx: GraphQLContext, id: string) {
  const [row] = await ctx.db.select().from(schema.resources).where(eq(schema.resources.id, id)).limit(1);
  if (!row) throw notFound("Resource");
  return row;
}

/** After a publish or archive: refresh the website's cached pages for every localization of the resource. */
async function revalidate(ctx: GraphQLContext, resourceId: string) {
  const resource = await editorialResource(ctx, resourceId);
  const locs = await ctx.db
    .select({ slug: schema.resourceLocalizations.slug })
    .from(schema.resourceLocalizations)
    .where(eq(schema.resourceLocalizations.resourceId, resourceId));
  void ctx.revalidator.notify([...new Set(locs.flatMap((l) => tagsForResource(resource.kind, l.slug)))]);
  return resource;
}

/** Authorizes against the site that owns the localization, never a site the client names. */
async function onLocalization(
  ctx: GraphQLContext,
  localizationId: string,
  permission: Parameters<typeof authorize>[2]
) {
  const siteId = await editorial.siteOfLocalization(ctx.db, localizationId);
  if (!siteId) throw notFound("Resource");
  return authorize(await ctx.actor(), siteId, permission).user.id;
}

export const resourceResolvers: Resolvers = {
  Query: {
    publishedResources: async (_, { filter, first, after }, ctx) => {
      if (filter?.search) ctx.limit("search");
      return publishedResources(ctx.db, await ctx.site(), filter ?? {}, first, after);
    },
    resourceBySlug: async (_, { kind, slug, locale }, ctx) =>
      resourceBySlug(ctx.db, await ctx.site(), kind, slug, locale),
    topics: async (_, __, ctx) => {
      const site = await ctx.site();
      return ctx.db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.siteId, site.id))
        .orderBy(asc(schema.topics.name));
    },
    editorialResources: async (_, { siteId, first }, ctx) => {
      authorize(await ctx.actor(), siteId, "content.read");
      return editorial.editorialResources(ctx.db, siteId, first);
    },
    editorialResource: async (_, { id }, ctx) => {
      const siteId = await editorial.siteOfResource(ctx.db, id);
      if (!siteId) return null;
      authorize(await ctx.actor(), siteId, "content.read");
      return editorialResource(ctx, id);
    },
  },

  Mutation: {
    createResource: async (_, { input }, ctx) => {
      const actor = authorize(await ctx.actor(), input.siteId, "content.write");
      const resource = await editorial.createResource(ctx.db, actor.user.id, {
        ...input,
        locale: input.locale ?? "en",
      });
      return resource;
    },
    startDraft: async (_, { localizationId }, ctx) => {
      const userId = await onLocalization(ctx, localizationId, "content.write");
      return editorialResource(ctx, await editorial.startDraft(ctx.db, userId, localizationId));
    },
    updateDraft: async (_, { input }, ctx) => {
      const userId = await onLocalization(ctx, input.localizationId, "content.write");
      return editorialResource(ctx, await editorial.updateDraft(ctx.db, userId, input));
    },
    submitForReview: async (_, { localizationId, lockVersion }, ctx) => {
      const userId = await onLocalization(ctx, localizationId, "content.submit");
      return editorialResource(
        ctx,
        await editorial.moveDraft(ctx.db, userId, localizationId, lockVersion, "IN_REVIEW")
      );
    },
    returnToDraft: async (_, { localizationId, lockVersion, note }, ctx) => {
      const userId = await onLocalization(ctx, localizationId, "content.review");
      return editorialResource(
        ctx,
        await editorial.moveDraft(ctx.db, userId, localizationId, lockVersion, "DRAFT", note)
      );
    },
    publishResource: async (_, { localizationId, lockVersion }, ctx) => {
      const userId = await onLocalization(ctx, localizationId, "content.publish");
      return revalidate(ctx, await editorial.publishResource(ctx.db, userId, localizationId, lockVersion));
    },
    saveExerciseSets: async (_, { localizationId, lockVersion, sets }, ctx) => {
      const userId = await onLocalization(ctx, localizationId, "content.write");
      if (!Array.isArray(sets)) throw invalid("sets must be a list of exercise sets");
      return editorialResource(
        ctx,
        await editorial.saveExerciseSets(ctx.db, userId, localizationId, lockVersion, sets as ExerciseSetInput[])
      );
    },
    archiveResource: async (_, { resourceId }, ctx) => {
      const siteId = await editorial.siteOfResource(ctx.db, resourceId);
      if (!siteId) throw notFound("Resource");
      const actor = authorize(await ctx.actor(), siteId, "content.archive");
      return revalidate(ctx, await editorial.archiveResource(ctx.db, actor.user.id, resourceId));
    },
  },

  Resource: { __resolveType: (p) => TYPE_BY_KIND[p.resource.kind] },
  ReadingResource: {
    ...common,
    vocabulary: (p, _, ctx) => ctx.loaders.annotatedSensesByRevision.load(p.revision.id),
    wordCount: (p) => wordCount(p.revision.plainText),
    estimatedReadingSeconds: (p) => readingSeconds(wordCount(p.revision.plainText)),
  },
  ListeningResource: common,
  ArticleResource: common,
  LexicalCollectionResource: {
    ...common,
    items: (p, _, ctx) => ctx.loaders.collectionItemsByRevision.load(p.revision.id),
  },

  EditorialResource: {
    site: async (r, _, ctx) => present(await ctx.loaders.site.load(r.siteId), "site"),
    localizations: (r, _, ctx) => ctx.loaders.localizationsByResource.load(r.id),
  },
  EditorialLocalization: {
    draft: (l, _, ctx) => (l.draftRevisionId ? ctx.loaders.revision.load(l.draftRevisionId) : null),
    published: (l, _, ctx) => (l.publishedRevisionId ? ctx.loaders.revision.load(l.publishedRevisionId) : null),
  },
  Revision: {
    body: (r) => r.richText,
    topics: (r, _, ctx) => ctx.loaders.topicsByRevision.load(r.id),
    vocabulary: (r, _, ctx) => ctx.loaders.annotatedSensesByRevision.load(r.id),
    // Answer keys, for editors: a Revision is only reachable through editorialResource(s), which authorize.
    exercises: (r, _, ctx) => exerciseSetsForEditing(ctx.db, r.id),
  },
};
