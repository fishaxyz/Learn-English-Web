import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { cefrLevel, createdAt, id, lexicalEntryKind, lexicalRelationKind, revisionStatus, updatedAt } from "./common";
import { mediaAssets, resourceRevisions } from "./content";
import { sites, users } from "./identity";

const siteRef = () =>
  uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" });

/**
 * A headword. Spellings are NOT unique: "bank" (river) and "bank" (money) are one entry with two senses, and
 * "lead" (noun) and "lead" (verb) can be separate entries (AGENTS.md §5.3).
 */
export const lexicalEntries = pgTable(
  "lexical_entries",
  {
    id: id(),
    siteId: siteRef(),
    language: text().notNull().default("en"),
    /** A search aid only (lowercase, single spaces); displayForm keeps the original. */
    normalizedHeadword: text().notNull(),
    displayForm: text().notNull(),
    kind: lexicalEntryKind().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("lexical_entries_id_site").on(t.id, t.siteId),
    index("lexical_entries_headword").on(t.siteId, t.normalizedHeadword),
    index("lexical_entries_headword_trgm").using("gin", t.normalizedHeadword.op("gin_trgm_ops")),
  ]
);

/** One meaning of an entry, with pointers to its current draft and published revision. */
export const lexicalSenses = pgTable(
  "lexical_senses",
  {
    id: id(),
    siteId: siteRef(),
    entryId: uuid().notNull(),
    partOfSpeech: text().notNull(),
    /** Stable across revisions, e.g. "bank-noun-money". */
    senseKey: text().notNull(),
    // Pointers to this sense's own revisions only: composite foreign keys in migrations/0002_integrity.sql.
    draftRevisionId: uuid(),
    publishedRevisionId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "lexical_senses_entry_fk",
      columns: [t.entryId, t.siteId],
      foreignColumns: [lexicalEntries.id, lexicalEntries.siteId],
    }).onDelete("cascade"),
    unique("lexical_senses_entry_key").on(t.entryId, t.senseKey),
    unique("lexical_senses_id_site").on(t.id, t.siteId),
  ]
);

/** One version of a sense. Frozen once PUBLISHED, so lessons that pinned it never change underneath. */
export const lexicalSenseRevisions = pgTable(
  "lexical_sense_revisions",
  {
    id: id(),
    siteId: siteRef(),
    senseId: uuid().notNull(),
    revisionNo: integer().notNull(),
    status: revisionStatus().notNull().default("DRAFT"),
    definitionEn: text().notNull(),
    cefrLevel: cefrLevel(),
    usageNote: text(),
    register: text(),
    lockVersion: integer().notNull().default(0),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    publishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "sense_revisions_sense_fk",
      columns: [t.senseId, t.siteId],
      foreignColumns: [lexicalSenses.id, lexicalSenses.siteId],
    }).onDelete("cascade"),
    unique("sense_revisions_sense_no").on(t.senseId, t.revisionNo),
    unique("sense_revisions_id_site").on(t.id, t.siteId),
    unique("sense_revisions_id_sense").on(t.id, t.senseId),
    check("sense_revisions_no_positive", sql`${t.revisionNo} > 0`),
    check(
      "sense_revisions_published_has_date",
      sql`${t.status} not in ('PUBLISHED', 'SUPERSEDED') or ${t.publishedAt} is not null`
    ),
  ]
);

/** Learner-facing example sentences (usage explanations are kept apart, in usageNote / explanation). */
export const lexicalExamples = pgTable("lexical_examples", {
  id: id(),
  senseRevisionId: uuid()
    .notNull()
    .references(() => lexicalSenseRevisions.id, { onDelete: "cascade" }),
  sentence: text().notNull(),
  explanation: text(),
  source: text(),
  position: integer().notNull().default(0),
});

export const lexicalPronunciations = pgTable(
  "lexical_pronunciations",
  {
    id: id(),
    siteId: siteRef(),
    senseRevisionId: uuid().notNull(),
    /** BCP 47 accent label, e.g. en-GB or en-US. */
    accent: text().notNull(),
    ipa: text().notNull(),
    audioAssetId: uuid(),
  },
  (t) => [
    foreignKey({
      name: "pronunciations_revision_fk",
      columns: [t.senseRevisionId, t.siteId],
      foreignColumns: [lexicalSenseRevisions.id, lexicalSenseRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "pronunciations_audio_fk",
      columns: [t.audioAssetId, t.siteId],
      foreignColumns: [mediaAssets.id, mediaAssets.siteId],
    }),
  ]
);

/** A definition or explanation in another language. */
export const lexicalGlosses = pgTable(
  "lexical_glosses",
  {
    id: id(),
    senseRevisionId: uuid()
      .notNull()
      .references(() => lexicalSenseRevisions.id, { onDelete: "cascade" }),
    locale: text().notNull(),
    text: text().notNull(),
  },
  (t) => [unique("lexical_glosses_revision_locale").on(t.senseRevisionId, t.locale)]
);

/** Sense-specific: a synonym of one meaning isn't a synonym of the others. */
export const lexicalRelations = pgTable(
  "lexical_relations",
  {
    siteId: siteRef(),
    sourceSenseRevisionId: uuid().notNull(),
    targetSenseRevisionId: uuid().notNull(),
    kind: lexicalRelationKind().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceSenseRevisionId, t.targetSenseRevisionId, t.kind] }),
    foreignKey({
      name: "lexical_relations_source_fk",
      columns: [t.sourceSenseRevisionId, t.siteId],
      foreignColumns: [lexicalSenseRevisions.id, lexicalSenseRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "lexical_relations_target_fk",
      columns: [t.targetSenseRevisionId, t.siteId],
      foreignColumns: [lexicalSenseRevisions.id, lexicalSenseRevisions.siteId],
    }).onDelete("cascade"),
    check("lexical_relations_not_self", sql`${t.sourceSenseRevisionId} <> ${t.targetSenseRevisionId}`),
  ]
);

/** A word collection's items: pinned to exact sense revisions. */
export const collectionItems = pgTable(
  "collection_items",
  {
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    senseRevisionId: uuid().notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.senseRevisionId] }),
    foreignKey({
      name: "collection_items_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "collection_items_sense_fk",
      columns: [t.senseRevisionId, t.siteId],
      foreignColumns: [lexicalSenseRevisions.id, lexicalSenseRevisions.siteId],
    }),
  ]
);

/**
 * Vocabulary links inside a revision's text, derived by the API from the rich text's `lexical` marks on every
 * save (so they can never drift from the text). Offsets are Unicode code points into the block's text.
 */
export const lexicalAnnotations = pgTable(
  "lexical_annotations",
  {
    id: id(),
    siteId: siteRef(),
    revisionId: uuid().notNull(),
    blockId: text().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    surfaceText: text().notNull(),
    senseRevisionId: uuid().notNull(),
    /** The editor marked this item as a key word of the text: suggested to learners first. */
    isKey: boolean().notNull().default(false),
  },
  (t) => [
    foreignKey({
      name: "lexical_annotations_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    foreignKey({
      name: "lexical_annotations_sense_fk",
      columns: [t.senseRevisionId, t.siteId],
      foreignColumns: [lexicalSenseRevisions.id, lexicalSenseRevisions.siteId],
    }),
    index("lexical_annotations_revision").on(t.revisionId),
    check("lexical_annotations_range", sql`${t.start} >= 0 and ${t.end} > ${t.start}`),
  ]
);
