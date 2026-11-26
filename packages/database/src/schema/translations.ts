import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { resourceRevisions } from "./content";
import { sites, users } from "./identity";

/**
 * A translation of one sentence of a revision's script, for bilingual reading (ADR 0009). The local language model
 * drafts it (DRAFT); an editor checks, edits and approves it (APPROVED). Learners see approved translations of the
 * published revision only. `start`/`end` are code-point offsets into the block, like lexical annotations;
 * `sourceText` is the English sentence it was made from, so a changed sentence is noticed and translated again.
 * Text only: translations have no voice-over.
 */
export const sentenceTranslations = pgTable(
  "sentence_translations",
  {
    id: id(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    revisionId: uuid().notNull(),
    /** vi, fr or de. */
    locale: text().notNull(),
    blockId: text().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    sourceText: text().notNull(),
    text: text().notNull(),
    /** DRAFT (made by the model, waiting for an editor) or APPROVED. */
    status: text().notNull().default("DRAFT"),
    decidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "sentence_translations_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    unique("sentence_translations_sentence").on(t.revisionId, t.locale, t.blockId, t.start),
    index("sentence_translations_revision").on(t.revisionId, t.locale, t.status),
    check("sentence_translations_status", sql`${t.status} in ('DRAFT', 'APPROVED')`),
    check("sentence_translations_locale", sql`${t.locale} in ('vi', 'fr', 'de')`),
    check("sentence_translations_span", sql`${t.start} >= 0 and ${t.end} > ${t.start}`),
    check("sentence_translations_text", sql`length(${t.text}) between 1 and 4000`),
  ]
);
