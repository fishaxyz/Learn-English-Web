import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  audioTrackStatus,
  cefrLevel,
  createdAt,
  id,
  mediaStatus,
  resourceKind,
  resourceRelationKind,
  revisionStatus,
  tsvector,
  updatedAt,
} from "./common";
import { sites, users } from "./identity";

// Composite foreign keys (child.site_id, child.parent_id) → parent(site_id, id) make it impossible to link
// one site's rows to another site's, whatever the application does (AGENTS.md §5.6).

const siteRef = () =>
  uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" });

/** A lesson or article. Its kind never changes. */
export const resources = pgTable(
  "resources",
  {
    id: id(),
    siteId: siteRef(),
    kind: resourceKind().notNull(),
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique("resources_id_site").on(t.id, t.siteId), index("resources_site_kind").on(t.siteId, t.kind)]
);

/** A resource in one locale, with its URL slug and pointers to its current draft and published revision. */
export const resourceLocalizations = pgTable(
  "resource_localizations",
  {
    id: id(),
    siteId: siteRef(),
    resourceId: uuid().notNull(),
    locale: text().notNull(),
    slug: text().notNull(),
    // Both pointers may only reference this localization's own revisions: enforced by composite foreign keys
    // in migrations/0002_integrity.sql (Drizzle can't type two tables that reference each other).
    draftRevisionId: uuid(),
    publishedRevisionId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "localizations_resource_fk",
      columns: [t.resourceId, t.siteId],
      foreignColumns: [resources.id, resources.siteId],
    }).onDelete("cascade"),
    unique("localizations_site_locale_slug").on(t.siteId, t.locale, t.slug),
    unique("localizations_resource_locale").on(t.resourceId, t.locale),
    unique("localizations_id_site").on(t.id, t.siteId),
    index("localizations_published").on(t.siteId, t.locale, t.publishedRevisionId),
    check("localizations_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ]
);

/** One version of a localized resource. Frozen once PUBLISHED (database trigger). */
export const resourceRevisions = pgTable(
  "resource_revisions",
  {
    id: id(),
    siteId: siteRef(),
    localizationId: uuid().notNull(),
    revisionNo: integer().notNull(),
    status: revisionStatus().notNull().default("DRAFT"),
    title: text().notNull(),
    summary: text(),
    cefrLevel: cefrLevel(),
    /** Tiptap document, validated by the API (schemaVersion says which shape). */
    richText: jsonb().notNull(),
    /** The document's text, for search and word counts. Derived by the API from richText. */
    plainText: text().notNull().default(""),
    seoTitle: text(),
    seoDescription: text(),
    schemaVersion: integer().notNull().default(1),
    /** Optimistic concurrency: an update must name the version it read. */
    lockVersion: integer().notNull().default(0),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    submittedAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    publishedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    search: tsvector().generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || plain_text)`
    ),
  },
  (t) => [
    foreignKey({
      name: "revisions_localization_fk",
      columns: [t.localizationId, t.siteId],
      foreignColumns: [resourceLocalizations.id, resourceLocalizations.siteId],
    }).onDelete("cascade"),
    unique("revisions_localization_no").on(t.localizationId, t.revisionNo),
    unique("revisions_id_site").on(t.id, t.siteId),
    unique("revisions_id_localization").on(t.id, t.localizationId),
    index("revisions_search").using("gin", t.search),
    index("revisions_browse").on(t.siteId, t.status, t.cefrLevel),
    check("revisions_no_positive", sql`${t.revisionNo} > 0`),
    check("revisions_title_length", sql`char_length(${t.title}) between 1 and 200`),
    check(
      "revisions_published_has_date",
      sql`${t.status} not in ('PUBLISHED', 'SUPERSEDED') or ${t.publishedAt} is not null`
    ),
  ]
);

/** The controlled topic list (Travel, Work, Health...). */
export const topics = pgTable(
  "topics",
  {
    id: id(),
    siteId: siteRef(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("topics_site_slug").on(t.siteId, t.slug),
    unique("topics_id_site").on(t.id, t.siteId),
    check("topics_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ]
);

export const revisionTopics = pgTable(
  "revision_topics",
  {
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    topicId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.topicId] }),
    foreignKey({
      name: "revision_topics_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "revision_topics_topic_fk",
      columns: [t.topicId, t.siteId],
      foreignColumns: [topics.id, topics.siteId],
    }),
    index("revision_topics_topic").on(t.topicId),
  ]
);

/** Optional exam classifications. General English is the default: no label. */
export const examLabels = pgTable(
  "exam_labels",
  {
    id: id(),
    siteId: siteRef(),
    code: text().notNull(),
    name: text().notNull(),
  },
  (t) => [unique("exam_labels_site_code").on(t.siteId, t.code), unique("exam_labels_id_site").on(t.id, t.siteId)]
);

export const revisionExamLabels = pgTable(
  "revision_exam_labels",
  {
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    examLabelId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.examLabelId] }),
    foreignKey({
      name: "revision_exam_labels_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "revision_exam_labels_label_fk",
      columns: [t.examLabelId, t.siteId],
      foreignColumns: [examLabels.id, examLabels.siteId],
    }),
  ]
);

export const resourceRelations = pgTable(
  "resource_relations",
  {
    siteId: siteRef(),
    fromResourceId: uuid().notNull(),
    toResourceId: uuid().notNull(),
    kind: resourceRelationKind().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromResourceId, t.toResourceId, t.kind] }),
    foreignKey({
      name: "resource_relations_from_fk",
      columns: [t.fromResourceId, t.siteId],
      foreignColumns: [resources.id, resources.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "resource_relations_to_fk",
      columns: [t.toResourceId, t.siteId],
      foreignColumns: [resources.id, resources.siteId],
    }).onDelete("cascade"),
    check("resource_relations_not_self", sql`${t.fromResourceId} <> ${t.toResourceId}`),
  ]
);

/** A stored file's record. The bytes live in object storage (R2), never in Postgres. */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    siteId: siteRef(),
    objectKey: text().notNull().unique(),
    mimeType: text().notNull(),
    checksumSha256: text(),
    bytes: bigint({ mode: "number" }),
    durationMs: integer(),
    status: mediaStatus().notNull().default("PENDING"),
    source: text(),
    license: text(),
    attribution: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("media_assets_id_site").on(t.id, t.siteId),
    check("media_assets_bytes", sql`${t.bytes} is null or ${t.bytes} >= 0`),
    check("media_assets_duration", sql`${t.durationMs} is null or ${t.durationMs} >= 0`),
  ]
);

/** Which assets a revision uses, and how (cover image, main audio...). Version-scoped. */
export const revisionMedia = pgTable(
  "revision_media",
  {
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    assetId: uuid().notNull(),
    role: text().notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.assetId, t.role] }),
    foreignKey({
      name: "revision_media_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "revision_media_asset_fk",
      columns: [t.assetId, t.siteId],
      foreignColumns: [mediaAssets.id, mediaAssets.siteId],
    }),
    index("revision_media_asset").on(t.assetId),
  ]
);

/**
 * One voice reading one revision's text (AGENTS.md §5.2: audio variants are separate, each with its own timing).
 * The voice's gender and accent are shown to learners as tags. Word timings are milliseconds relative to this
 * track, keyed by block id and code-point offsets like vocabulary annotations; they're never invented: a track
 * without provider timings has none. `textHash` says which text it read, so a changed text marks it stale.
 */
export const audioTracks = pgTable(
  "audio_tracks",
  {
    id: id(),
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    assetId: uuid(),
    status: audioTrackStatus().notNull().default("GENERATING"),
    provider: text().notNull(),
    voiceId: text().notNull(),
    voiceName: text().notNull(),
    /** "male" or "female", as the provider labels the voice. */
    gender: text().notNull(),
    /** "us" or "uk". */
    accent: text().notNull(),
    modelId: text(),
    characters: integer().notNull(),
    textHash: text().notNull(),
    wordTimings: jsonb(),
    durationMs: integer(),
    position: integer().notNull().default(0),
    jobId: uuid(),
    error: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "audio_tracks_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "audio_tracks_asset_fk",
      columns: [t.assetId, t.siteId],
      foreignColumns: [mediaAssets.id, mediaAssets.siteId],
    }),
    index("audio_tracks_revision").on(t.revisionId),
    check("audio_tracks_gender", sql`${t.gender} in ('male', 'female')`),
    check("audio_tracks_accent", sql`${t.accent} in ('us', 'uk')`),
    check("audio_tracks_characters", sql`${t.characters} > 0`),
  ]
);
