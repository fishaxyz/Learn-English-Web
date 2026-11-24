import { schema, type Database } from "@english/database";
import { and, desc, eq, exists, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { PublishedResourceModel } from "../../models";
import { decodeCursor, encodeCursor, pageSize } from "./cursor";
import { present } from "../../rows";

type Kind = (typeof schema.resourceKind.enumValues)[number];
type Level = (typeof schema.cefrLevel.enumValues)[number];

export type ResourceFilter = {
  kind?: Kind | null;
  cefrLevel?: Level | null;
  topicSlug?: string | null;
  locale?: string | null;
  search?: string | null;
};

const { resources, resourceLocalizations: loc, resourceRevisions: rev } = schema;

/**
 * Only what learners may see: the localization's current PUBLISHED revision (never a draft), of a resource
 * that isn't archived, on this site (AGENTS.md §5.1).
 */
function publishedQuery(db: Database, siteId: string, locale: string, where: (SQL | undefined)[]) {
  return db
    .select({ resource: resources, localization: loc, revision: rev })
    .from(loc)
    .innerJoin(rev, and(eq(rev.id, loc.publishedRevisionId), eq(rev.status, "PUBLISHED")))
    .innerJoin(resources, eq(resources.id, loc.resourceId))
    .where(and(eq(loc.siteId, siteId), eq(loc.locale, locale), isNull(resources.archivedAt), ...where));
}

export async function publishedResources(
  db: Database,
  site: { id: string; defaultLocale: string },
  filter: ResourceFilter,
  first: number,
  after?: string | null
) {
  const limit = pageSize(first);
  const cursor = after ? decodeCursor(after) : null;
  const search = filter.search?.trim().slice(0, 200);
  const rows = await publishedQuery(db, site.id, filter.locale ?? site.defaultLocale, [
    filter.kind ? eq(resources.kind, filter.kind) : undefined,
    filter.cefrLevel ? eq(rev.cefrLevel, filter.cefrLevel) : undefined,
    filter.topicSlug
      ? exists(
          db
            .select({ one: sql`1` })
            .from(schema.revisionTopics)
            .innerJoin(schema.topics, eq(schema.topics.id, schema.revisionTopics.topicId))
            .where(and(eq(schema.revisionTopics.revisionId, rev.id), eq(schema.topics.slug, filter.topicSlug)))
        )
      : undefined,
    search ? sql`${rev.search} @@ websearch_to_tsquery('english', ${search})` : undefined,
    cursor
      ? or(lt(rev.publishedAt, cursor.publishedAt), and(eq(rev.publishedAt, cursor.publishedAt), lt(rev.id, cursor.id)))
      : undefined,
  ])
    .orderBy(desc(rev.publishedAt), desc(rev.id))
    .limit(limit + 1);

  const nodes: PublishedResourceModel[] = rows.slice(0, limit);
  const last = nodes.at(-1);
  return {
    nodes,
    pageInfo: {
      hasNextPage: rows.length > limit,
      endCursor: last
        ? encodeCursor({ publishedAt: present(last.revision.publishedAt, "publishedAt"), id: last.revision.id })
        : null,
    },
  };
}

export async function resourceBySlug(
  db: Database,
  site: { id: string; defaultLocale: string },
  kind: Kind,
  slug: string,
  locale?: string | null
): Promise<PublishedResourceModel | null> {
  const [row] = await publishedQuery(db, site.id, locale ?? site.defaultLocale, [
    eq(resources.kind, kind),
    eq(loc.slug, slug),
  ]).limit(1);
  return row ?? null;
}
