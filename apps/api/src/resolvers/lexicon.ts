import { schema } from "@english/database";
import { eq } from "drizzle-orm";
import { authorize } from "../auth/actor";
import type { GraphQLContext } from "../context";
import { notFound } from "../errors";
import type { Resolvers } from "../generated/resolvers";
import type { SenseRevisionModel } from "../models";
import * as lexicon from "../modules/lexicon/service";
import { present } from "../rows";

async function editorialSense(ctx: GraphQLContext, id: string) {
  const [row] = await ctx.db.select().from(schema.lexicalSenses).where(eq(schema.lexicalSenses.id, id)).limit(1);
  if (!row) throw notFound("Sense");
  return row;
}

const revisionParts = {
  examples: (r: SenseRevisionModel, _: unknown, ctx: GraphQLContext) => ctx.loaders.examplesBySenseRevision.load(r.id),
  pronunciations: (r: SenseRevisionModel, _: unknown, ctx: GraphQLContext) =>
    ctx.loaders.pronunciationsBySenseRevision.load(r.id),
};

export const lexiconResolvers: Resolvers = {
  Query: {
    lexicalSearch: async (_, { query, first }, ctx) => {
      ctx.limit("search");
      return lexicon.lexicalSearch(ctx.db, (await ctx.site()).id, query, first);
    },
    lexicalEntryById: async (_, { id }, ctx) => lexicon.lexicalEntryById(ctx.db, (await ctx.site()).id, id),
  },

  Mutation: {
    manageLexicalSense: async (_, { input }, ctx) => {
      const actor = authorize(await ctx.actor(), input.siteId, "lexicon.write");
      if (input.senseId && (await lexicon.siteOfSense(ctx.db, input.senseId)) !== input.siteId) throw notFound("Sense");
      const senseId = await lexicon.manageLexicalSense(ctx.db, actor.user.id, {
        ...input,
        examples: input.examples ?? [],
        pronunciations: input.pronunciations ?? [],
      });
      return editorialSense(ctx, senseId);
    },
    publishLexicalSense: async (_, { senseId, lockVersion }, ctx) => {
      const siteId = await lexicon.siteOfSense(ctx.db, senseId);
      if (!siteId) throw notFound("Sense");
      const actor = authorize(await ctx.actor(), siteId, "lexicon.publish");
      return editorialSense(ctx, await lexicon.publishLexicalSense(ctx.db, actor.user.id, senseId, lockVersion));
    },
  },

  LexicalEntry: {
    senses: (e, _, ctx) => ctx.loaders.publishedSensesByEntry.load(e.id),
  },
  LexicalSense: {
    id: (s) => s.sense.id,
    senseKey: (s) => s.sense.senseKey,
    partOfSpeech: (s) => s.sense.partOfSpeech,
    revisionId: (s) => s.revision.id,
    definition: (s) => s.revision.definitionEn,
    cefrLevel: (s) => s.revision.cefrLevel,
    usageNote: (s) => s.revision.usageNote,
    register: (s) => s.revision.register,
    examples: (s, _, ctx) => ctx.loaders.examplesBySenseRevision.load(s.revision.id),
    pronunciations: (s, _, ctx) => ctx.loaders.pronunciationsBySenseRevision.load(s.revision.id),
    entry: async (s, _, ctx) => present(await ctx.loaders.entry.load(s.sense.entryId), "entry"),
  },
  EditorialSense: {
    entry: async (s, _, ctx) => present(await ctx.loaders.entry.load(s.entryId), "entry"),
    draft: (s, _, ctx) => (s.draftRevisionId ? ctx.loaders.senseRevision.load(s.draftRevisionId) : null),
    published: (s, _, ctx) => (s.publishedRevisionId ? ctx.loaders.senseRevision.load(s.publishedRevisionId) : null),
  },
  SenseRevision: {
    definition: (r) => r.definitionEn,
    ...revisionParts,
  },
};
