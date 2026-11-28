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

/**
 * A lesson's own lexical vocabulary (ADR 0010): an item from the editor's list (uploaded or pasted) with an
 * IELTS-style explanation. Each revision has its own items; nothing is shared between lessons. The local language
 * model drafts the explanation (PENDING → DRAFT); an editor checks, edits and approves it (APPROVED). Learners see
 * approved items of the published revision. `quote` is the item's words as the script has them; the sentence it
 * comes from is found in the current script when shown, so script edits never leave it stale.
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
    /** The editor's note from the list ("idiom", "Writing Task 2"…), for the model. */
    note: text(),
    kind: text(),
    quote: text(),
    meaning: text(),
    synonyms: jsonb().$type<string[]>().notNull().default([]),
    example: text(),
    ieltsTip: text(),
    /** PENDING (waiting for the model), DRAFT (waiting for an editor) or APPROVED. */
    status: text().notNull().default("PENDING"),
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
    check("lexical_items_status", sql`${t.status} in ('PENDING', 'DRAFT', 'APPROVED')`),
    check(
      "lexical_items_kind",
      sql`${t.kind} is null or ${t.kind} in ('KEYWORD', 'COLLOCATION', 'IDIOM', 'PHRASAL_VERB', 'STRUCTURE', 'PARAPHRASE')`
    ),
    check("lexical_items_text", sql`length(${t.text}) between 1 and 200`),
    check(
      "lexical_items_approved",
      sql`${t.status} <> 'APPROVED' or (${t.kind} is not null and ${t.meaning} is not null)`
    ),
  ]
);
