import { schema, type Database } from "@english/database";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { conflict, invalid, notFound } from "../../errors";
import type { RevisionModel } from "../../models";
import { one } from "../../rows";
import { audit } from "../audit";
import { lockLocalization } from "../resources/editorial";
import { blockTexts, type RichTextDocument } from "../rich-text";
import { TRANSLATION_LOCALES } from "../translations/service";
import { keyOf, parseSheet, type LexicalItemKind, type SheetItem } from "./sheet";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = typeof rows.$inferSelect;
type Translations = Record<string, string>;
const { lexicalItems: rows } = schema;
export type { LexicalItemKind };

/**
 * A lesson's own lexical vocabulary (ADRs 0010, 0011). The editor uploads or pastes a vocabulary sheet; its
 * explanations are the editor's own, read into items as written (see ./sheet). A sheet's meanings and translations
 * are in one native language, chosen when it's added: a sheet in another language adds that language to the same
 * items. Editors check and approve; learners see approved items in the Lexical Vocabulary tab, in their language.
 * Each lesson keeps its own items.
 */
const MAX_ITEMS = 200;
const MAX_SHEET = 200_000;

async function editableDraft(tx: Tx, localizationId: string) {
  const l = await lockLocalization(tx, localizationId);
  if (!l.draftRevisionId) throw conflict("There's no draft: start one first");
  const draft = one(
    await tx.select().from(schema.resourceRevisions).where(eq(schema.resourceRevisions.id, l.draftRevisionId))
  );
  if (draft.status !== "DRAFT") throw conflict("The draft is in review; a reviewer must return it first");
  return draft;
}

/** This language's translation (if any) next to what other languages' sheets gave the same text. */
function withTranslation(before: Translations | undefined, language: string, translation: string | null) {
  const others = Object.entries(before ?? {}).filter(([l]) => l !== language);
  return Object.fromEntries(translation ? [...others, [language, translation]] : others);
}

/** The item's columns from the sheet, keeping what other languages' sheets gave the same examples and synonyms. */
function fromSheet(item: SheetItem, language: string, before?: Row) {
  const oldExamples = new Map(before?.examples.map((e) => [keyOf(e.text), e.translations]));
  const oldSynonyms = new Map(before?.synonyms.map((s) => [keyOf(s.text), s.translations]));
  const otherLanguages = Object.fromEntries(Object.entries(before?.languages ?? {}).filter(([l]) => l !== language));
  const part = item.language;
  const hasPart = part.meaning || part.definition || part.notes.length;
  return {
    text: item.text,
    key: keyOf(item.text),
    kind: item.kind,
    partOfSpeech: item.partOfSpeech ?? before?.partOfSpeech ?? null,
    pronunciation: item.pronunciation ?? before?.pronunciation ?? null,
    definition: item.definition ?? before?.definition ?? null,
    usage: item.usage ?? before?.usage ?? null,
    examples: item.examples.length
      ? item.examples.map((e) => ({
          text: e.text,
          translations: withTranslation(oldExamples.get(keyOf(e.text)), language, e.translation),
        }))
      : (before?.examples ?? []),
    synonyms: item.synonyms.length
      ? item.synonyms.map((s) => ({
          text: s.text,
          note: s.note,
          translations: withTranslation(oldSynonyms.get(keyOf(s.text)), language, s.translation),
        }))
      : (before?.synonyms ?? []),
    pairedWith: item.pairedWith ?? before?.pairedWith ?? null,
    question: item.question ?? before?.question ?? null,
    languages: hasPart ? { ...otherLanguages, [language]: part } : otherLanguages,
    status: "DRAFT",
    decidedBy: null,
    decidedAt: null,
  };
}

/**
 * "Add the sheet": its items join the lesson in sheet order. Items already there (same words) are updated from the
 * sheet and go back to draft, so an editor checks them again.
 */
export async function addLexicalSheet(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  sheet: string,
  language: string
) {
  if (!(TRANSLATION_LOCALES as readonly string[]).includes(language)) {
    throw invalid(`A sheet's language is one of ${TRANSLATION_LOCALES.join(", ")}`);
  }
  if (sheet.length > MAX_SHEET) throw invalid("The sheet is too long (200,000 characters at most)");
  const items = parseSheet(sheet);
  if (!items.length) throw invalid("No items found: number each item (“1. disrupt (v) – …”) or write one per line");
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    const existing = await tx.select().from(rows).where(eq(rows.revisionId, draft.id));
    const byKey = new Map(existing.map((r) => [r.key, r]));
    const fresh = items.filter((i) => !byKey.has(keyOf(i.text)));
    if (existing.length + fresh.length > MAX_ITEMS) throw invalid(`A lesson can have up to ${MAX_ITEMS} items`);
    let position = existing.reduce((max, r) => Math.max(max, r.position), -1);
    for (const item of items) {
      const before = byKey.get(keyOf(item.text));
      if (before) {
        await tx
          .update(rows)
          .set(fromSheet(item, language, before))
          .where(eq(rows.id, before.id));
      } else {
        await tx
          .insert(rows)
          .values({ siteId: draft.siteId, revisionId: draft.id, position: ++position, ...fromSheet(item, language) });
      }
    }
    const updated = items.length - fresh.length;
    await audit(tx, {
      siteId: draft.siteId,
      actorUserId,
      action: "lexical_items.sheet_added",
      entityType: "revision",
      entityId: draft.id,
      data: { language, added: fresh.length, updated },
    });
    return { added: fresh.length, updated };
  });
}

/** Lowercase, plain quotes and spaces, no "…" or end mark: for finding an example sentence in the script. */
const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/^[\s.…]+|[\s.…!?]+$/g, "")
    .trim();

/** Languages in a fixed order (the database doesn't keep the order they were added in). */
const rank = (language: string) => {
  const at = (TRANSLATION_LOCALES as readonly string[]).indexOf(language);
  return at < 0 ? TRANSLATION_LOCALES.length : at;
};
const byLanguage = <T>(record: Record<string, T>) =>
  Object.entries(record).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
const asList = (translations: Translations) => byLanguage(translations).map(([language, text]) => ({ language, text }));

const view = (r: Row, script: string) => ({
  id: r.id,
  text: r.text,
  kind: r.kind as LexicalItemKind,
  partOfSpeech: r.partOfSpeech,
  pronunciation: r.pronunciation,
  definition: r.definition,
  usage: r.usage,
  // Checked against the current script each time, so script edits never leave it stale.
  examples: r.examples.map((e) => ({
    text: e.text,
    inText: plain(e.text).length > 0 && script.includes(plain(e.text)),
    translations: asList(e.translations),
  })),
  synonyms: r.synonyms.map((s) => ({ text: s.text, note: s.note, translations: asList(s.translations) })),
  pairedWith: r.pairedWith,
  question: r.question,
  languages: byLanguage(r.languages).map(([language, part]) => ({ language, ...part })),
  status: r.status as "DRAFT" | "APPROVED",
});

async function itemsOf(db: Database, revision: Pick<RevisionModel, "id" | "richText">, approvedOnly: boolean) {
  const found = await db
    .select()
    .from(rows)
    .where(and(eq(rows.revisionId, revision.id), approvedOnly ? eq(rows.status, "APPROVED") : undefined))
    .orderBy(asc(rows.position));
  const script = plain([...blockTexts(revision.richText as RichTextDocument).values()].join(" "));
  return found.map((r) => view(r, script));
}

/** The draft's items, in sheet order. */
export const lexicalItemsFor = (db: Database, revision: Pick<RevisionModel, "id" | "richText">) =>
  itemsOf(db, revision, false);

/** What learners see: the approved items of a published revision, in sheet order. */
export const approvedLexicalItems = (db: Database, revision: Pick<RevisionModel, "id" | "richText">) =>
  itemsOf(db, revision, true);

/** How many approved items a revision has (the lesson checklist counts them as vocabulary). */
export async function approvedLexicalCount(tx: Tx | Database, revisionId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(rows)
    .where(and(eq(rows.revisionId, revisionId), eq(rows.status, "APPROVED")));
  return row?.n ?? 0;
}

/** A new draft starts with the published revision's items. */
export async function copyLexicalItems(tx: Tx, fromRevisionId: string, toRevisionId: string) {
  const from = await tx.select().from(rows).where(eq(rows.revisionId, fromRevisionId));
  if (from.length) {
    await tx.insert(rows).values(from.map(({ id: _id, ...r }) => ({ ...r, revisionId: toRevisionId })));
  }
}

export type LexicalItemApproval = { id: string; kind: LexicalItemKind };

/** Editors approve items, with the kind they chose. */
export async function approveLexicalItems(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  items: LexicalItemApproval[]
) {
  if (!items.length || items.length > MAX_ITEMS) throw invalid(`Choose 1 to ${MAX_ITEMS} items`);
  const ids = [...new Set(items.map((i) => i.id))];
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    const found = await tx
      .select({ id: rows.id })
      .from(rows)
      .where(and(eq(rows.revisionId, draft.id), inArray(rows.id, ids)));
    if (found.length !== ids.length) throw notFound("Lexical item");
    const now = new Date();
    for (const item of items) {
      await tx
        .update(rows)
        .set({ kind: item.kind, status: "APPROVED", decidedBy: actorUserId, decidedAt: now })
        .where(eq(rows.id, item.id));
    }
    await audit(tx, {
      siteId: draft.siteId,
      actorUserId,
      action: "lexical_items.approved",
      entityType: "revision",
      entityId: draft.id,
      data: { items: ids },
    });
    return ids.length;
  });
}

/** Editors remove items from the lesson. */
export async function deleteLexicalItems(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  ids: string[]
) {
  if (!ids.length || ids.length > MAX_ITEMS) throw invalid(`Choose 1 to ${MAX_ITEMS} items`);
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    const gone = await tx
      .delete(rows)
      .where(and(eq(rows.revisionId, draft.id), inArray(rows.id, ids)))
      .returning({ id: rows.id });
    if (gone.length !== new Set(ids).size) throw notFound("Lexical item");
    await audit(tx, {
      siteId: draft.siteId,
      actorUserId,
      action: "lexical_items.removed",
      entityType: "revision",
      entityId: draft.id,
      data: { items: ids },
    });
    return gone.length;
  });
}
