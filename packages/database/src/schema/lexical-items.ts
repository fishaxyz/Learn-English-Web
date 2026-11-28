import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { resourceRevisions } from "./content";
import { sites, users } from "./identity";

/** What kind of lexical item it is, for grouping in the learner's Lexical Vocabulary tab. */
export const LEXICAL_ITEM_KINDS = [
  "KEYWORD",
  "COLLOCATION",
  "IDIOM",
  "PHRASAL_VERB",
  "STRUCTURE",
  "PARAPHRASE",
] as const;

/** Translations by language ("vi" → "…"). */
export type LexicalTranslations = Record<string, string>;
export type LexicalExample = { text: string; translations: LexicalTranslations };
export type LexicalSynonym = { text: string; note: string | null; translations: LexicalTranslations };
/** The parts of an item written in one native language: its meaning, a translated definition, the notes. */
export type LexicalLanguagePart = {
  meaning: string | null;
  definition: string | null;
  notes: { text: string; translation: string | null }[];
};

/**
 * A lesson's own lexical vocabulary (ADRs 0010, 0011): an item of the editor's vocabulary sheet, with the editor's
 * own explanation kept as written. English parts (definition, usage, examples, synonyms) are shared by every learner;
 * each native language's sheet adds its own parts (`languages`, and the translations of examples and synonyms).
 * Each revision has its own items; nothing is shared between lessons. An editor checks and approves them; learners
 * see approved items of the published revision.
 */
export const lexicalItems = pgTable(
  "lexical_items",
  {
    id: id(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    revisionId: uuid().notNull(),
    position: integer().notNull(),
    /** The item as the editor listed it. */
    text: text().notNull(),
    /** Lowercased, spaces tidied: one item per revision. */
    key: text().notNull(),
    kind: text().notNull(),
    /** "v", "adj", "phr v"… as the sheet writes it. */
    partOfSpeech: text(),
    pronunciation: text(),
    /** The English definition (for a structure: when to use it). */
    definition: text(),
    /** How it's used: "disrupt + a cycle/routine/service". */
    usage: text(),
    examples: jsonb().$type<LexicalExample[]>().notNull().default([]),
    synonyms: jsonb().$type<LexicalSynonym[]>().notNull().default([]),
    /** A paraphrase's other side: the question's words for the text's words. */
    pairedWith: text(),
    /** The question it belongs to, as the sheet labels it ("Q2"). */
    question: text(),
    /** What each native language's sheet adds: meaning, translated definition, notes. */
    languages: jsonb().$type<Record<string, LexicalLanguagePart>>().notNull().default({}),
    /** DRAFT (waiting for an editor) or APPROVED. */
    status: text().notNull().default("DRAFT"),
    decidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "lexical_items_revision_fk",
      columns: [t.revisionId, t.siteId],
      foreignColumns: [resourceRevisions.id, resourceRevisions.siteId],
    }).onDelete("cascade"),
    unique("lexical_items_key").on(t.revisionId, t.key),
    index("lexical_items_revision").on(t.revisionId, t.position),
    check("lexical_items_status", sql`${t.status} in ('DRAFT', 'APPROVED')`),
    check(
      "lexical_items_kind",
      sql`${t.kind} in ('KEYWORD', 'COLLOCATION', 'IDIOM', 'PHRASAL_VERB', 'STRUCTURE', 'PARAPHRASE')`
    ),
    check("lexical_items_text", sql`length(${t.text}) between 1 and 200`),
  ]
);
