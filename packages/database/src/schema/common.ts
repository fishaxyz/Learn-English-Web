import { customType, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

// Enum values are UPPER_CASE so they match the GraphQL enums one to one.

export const cefrLevel = pgEnum("cefr_level", ["A1", "A2", "B1", "B2", "C1", "C2"]);
export const resourceKind = pgEnum("resource_kind", ["READING", "LISTENING", "LEXICAL_COLLECTION", "ARTICLE"]);
/** DRAFT → IN_REVIEW → PUBLISHED → SUPERSEDED (when a newer revision is published). PUBLISHED and SUPERSEDED are frozen. */
export const revisionStatus = pgEnum("revision_status", ["DRAFT", "IN_REVIEW", "PUBLISHED", "SUPERSEDED"]);
export const siteRole = pgEnum("site_role", ["OWNER", "ADMIN", "EDITOR", "REVIEWER", "VIEWER"]);
export const resourceRelationKind = pgEnum("resource_relation_kind", ["RELATED", "PREREQUISITE", "COMPANION"]);
export const mediaStatus = pgEnum("media_status", ["PENDING", "READY", "FAILED", "DELETED"]);
export const lexicalEntryKind = pgEnum("lexical_entry_kind", [
  "WORD",
  "PHRASE",
  "COLLOCATION",
  "IDIOM",
  "PHRASAL_VERB",
]);
export const lexicalRelationKind = pgEnum("lexical_relation_kind", [
  "SYNONYM",
  "ANTONYM",
  "WORD_FAMILY",
  "RELATED_COLLOCATION",
]);
export const questionType = pgEnum("question_type", ["SINGLE_CHOICE", "TRUE_FALSE_NOT_GIVEN", "GAP_FILL"]);

export const id = () => uuid().primaryKey().defaultRandom();
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Postgres full-text search vector (generated columns only; never written by the app). */
export const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
