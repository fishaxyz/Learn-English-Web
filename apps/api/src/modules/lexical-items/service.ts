import { schema, type Database } from "@english/database";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import { conflict, invalid, notFound } from "../../errors";
import type { RevisionModel } from "../../models";
import { one } from "../../rows";
import { audit } from "../audit";
import { enqueue, markSucceeded, type JobRow } from "../jobs/service";
import { isLooking } from "../lexicon/suggestions";
import { lockLocalization } from "../resources/editorial";
import { blockTexts, sentencesOf, type RichTextDocument } from "../rich-text";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const { lexicalItems: rows } = schema;

/**
 * A lesson's own lexical vocabulary (ADR 0010). An editor uploads or pastes a list of items (keywords, collocations,
 * idioms, structures…), one per line; a background job asks the local language model to explain each one for IELTS
 * learners (meaning, synonyms, an example, a tip) and to find its words in the script. Editors check, edit and
 * approve; learners see approved items in the Lexical Vocabulary tab. Each lesson keeps its own items.
 */
export const EXPLAIN_JOB = "lexicon.explain";
const { LEXICAL_ITEM_KINDS } = schema;
export type LexicalItemKind = (typeof LEXICAL_ITEM_KINDS)[number];
const prefix = (revisionId: string) => `explain:${revisionId}:`;
const MAX_ITEMS = 200;
const LIMIT = { text: 200, note: 300, quote: 300, meaning: 600, synonym: 100, synonyms: 10, example: 600, tip: 600 };

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const keyOf = (s: string) => tidy(s).toLowerCase();

/**
 * The editor's list: one item per line. Bullets and numbering are dropped; a note may follow a spaced dash or a tab
 * ("a grain of truth — idiom"). Duplicates (ignoring case) count once.
 */
export function parseLexicalList(list: string): { text: string; note: string | null }[] {
  const seen = new Set<string>();
  return listedLines(list).filter((item) => !seen.has(keyOf(item.text)) && seen.add(keyOf(item.text)));
}

/** Every item line of the list, repeats included. */
function listedLines(list: string): { text: string; note: string | null }[] {
  return list.split(/\r?\n/).flatMap((raw) => {
    const line = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim();
    const [first = "", ...rest] = line.split(/\s+[—–-]\s+|\t+/);
    const text = tidy(first).slice(0, LIMIT.text);
    const note = tidy(rest.join(" — ")).slice(0, LIMIT.note);
    return text ? [{ text, note: note || null }] : [];
  });
}

/** The sentence of the script that has these words ("…" for words split apart), or null. */
export function sentenceWith(doc: RichTextDocument, words: string | null): string | null {
  const parts = (words ?? "")
    .toLowerCase()
    .split(/\s*(?:…|\.\.\.)\s*/)
    .map(tidy)
    .filter(Boolean);
  if (!parts.length) return null;
  for (const text of blockTexts(doc).values()) {
    const chars = [...text];
    for (const span of sentencesOf(text)) {
      const sentence = chars.slice(span.start, span.end).join("");
      const lower = sentence.toLowerCase();
      let from = 0;
      const found = parts.every((p) => {
        const at = lower.indexOf(p, from);
        if (at < 0) return false;
        from = at + p.length;
        return true;
      });
      if (found) return sentence;
    }
  }
  return null;
}

async function editableDraft(tx: Tx, localizationId: string) {
  const l = await lockLocalization(tx, localizationId);
  if (!l.draftRevisionId) throw conflict("There's no draft: start one first");
  const draft = one(
    await tx.select().from(schema.resourceRevisions).where(eq(schema.resourceRevisions.id, l.draftRevisionId))
  );
  if (draft.status !== "DRAFT") throw conflict("The draft is in review; a reviewer must return it first");
  return draft;
}

/** Asks the worker to explain the items still waiting (PENDING), with the script for context. */
async function queueExplain(tx: Tx, draft: RevisionModel, actorUserId: string | null) {
  const pending = await tx
    .select({ id: rows.id, text: rows.text, note: rows.note })
    .from(rows)
    .where(and(eq(rows.revisionId, draft.id), eq(rows.status, "PENDING")))
    .orderBy(asc(rows.position));
  if (!pending.length) return null;
  const paragraphs = [...blockTexts(draft.richText as RichTextDocument)]
    .filter(([, text]) => /\p{L}/u.test(text))
    .map(([blockId, text]) => ({ blockId, text }));
  return enqueue(tx, {
    siteId: draft.siteId,
    type: EXPLAIN_JOB,
    idempotencyKey: `${prefix(draft.id)}${Date.now()}`,
    createdBy: actorUserId,
    maxAttempts: 2,
    payload: { revisionId: draft.id, level: draft.cefrLevel, paragraphs, items: pending },
  });
}

/** "Add the list": new items join the lesson's list (as PENDING) and the local AI is asked to explain them. */
export async function addLexicalList(db: Database, actorUserId: string | null, localizationId: string, list: string) {
  if (list.length > 50_000) throw invalid("The list is too long (50,000 characters at most)");
  const parsed = parseLexicalList(list);
  if (!parsed.length) throw invalid("The list has no items: write one item per line");
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    if (await isLooking(tx, draft.siteId, prefix(draft.id))) {
      throw conflict("The AI is still explaining the last list: wait until it's done");
    }
    const existing = await tx
      .select({ key: rows.key, position: rows.position })
      .from(rows)
      .where(eq(rows.revisionId, draft.id));
    const have = new Set(existing.map((e) => e.key));
    const fresh = parsed.filter((p) => !have.has(keyOf(p.text)));
    if (existing.length + fresh.length > MAX_ITEMS) throw invalid(`A lesson can have up to ${MAX_ITEMS} items`);
    let position = existing.reduce((max, e) => Math.max(max, e.position), -1);
    if (fresh.length) {
      await tx.insert(rows).values(
        fresh.map((p) => ({
          siteId: draft.siteId,
          revisionId: draft.id,
          position: ++position,
          text: p.text,
          key: keyOf(p.text),
          note: p.note,
        }))
      );
      await queueExplain(tx, draft, actorUserId);
    }
    return { added: fresh.length, skipped: listedLines(list).length - fresh.length };
  });
}

/** "Explain again": items still waiting, and with `redo` every unapproved one, are explained by the local AI. */
export async function explainLexicalItems(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  redo: boolean
) {
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    if (await isLooking(tx, draft.siteId, prefix(draft.id))) throw conflict("The AI is already explaining this list");
    if (redo) {
      await tx
        .update(rows)
        .set({ status: "PENDING", kind: null, quote: null, meaning: null, synonyms: [], example: null, ieltsTip: null })
        .where(and(eq(rows.revisionId, draft.id), eq(rows.status, "DRAFT")));
    }
    if (!(await queueExplain(tx, draft, actorUserId))) throw conflict("Every item already has an explanation");
    return true;
  });
}

const kind = z.enum(LEXICAL_ITEM_KINDS);
const result = z.strictObject({
  ai: z.boolean(),
  items: z
    .array(
      z.strictObject({
        id: z.string(),
        kind: z.string(),
        quote: z.string().nullable(),
        meaning: z.string(),
        synonyms: z.array(z.string()).max(50),
        example: z.string().nullable(),
        ieltsTip: z.string().nullable(),
      })
    )
    .max(MAX_ITEMS),
});

const clip = (s: string | null | undefined, max: number) => {
  const t = tidy(s ?? "");
  return t ? t.slice(0, max) : null;
};
const cleanSynonyms = (list: string[]) =>
  [...new Set(list.map(tidy).filter((s) => s && s.length <= LIMIT.synonym))].slice(0, LIMIT.synonyms);

/** The worker's explanations: kept as drafts for items still waiting in this draft. */
export async function completeExplainJob(tx: Tx, job: JobRow, raw: unknown) {
  const parsed = result.safeParse(raw);
  if (!parsed.success) throw invalid("The job's result isn't valid");
  const payload = job.payloadJson as { revisionId: string; items: { id: string }[] };
  const [revision] = await tx
    .select()
    .from(schema.resourceRevisions)
    .where(eq(schema.resourceRevisions.id, payload.revisionId));
  if (!revision || revision.status !== "DRAFT") {
    await markSucceeded(tx, job, { stale: true, ai: parsed.data.ai });
    return true;
  }
  const asked = new Set(payload.items.map((i) => i.id));
  const doc = revision.richText as RichTextDocument;
  let explained = 0;
  for (const item of parsed.data.items) {
    const meaning = clip(item.meaning, LIMIT.meaning);
    if (!asked.has(item.id) || !meaning) continue;
    const quote = clip(item.quote, LIMIT.quote);
    const updated = await tx
      .update(rows)
      .set({
        status: "DRAFT",
        kind: kind.safeParse(item.kind).data ?? "KEYWORD",
        // Only words really in the script: never an invented quote.
        quote: quote && sentenceWith(doc, quote) ? quote : null,
        meaning,
        synonyms: cleanSynonyms(item.synonyms),
        example: clip(item.example, LIMIT.example),
        ieltsTip: clip(item.ieltsTip, LIMIT.tip),
      })
      .where(and(eq(rows.id, item.id), eq(rows.revisionId, revision.id), eq(rows.status, "PENDING")))
      .returning({ id: rows.id });
    explained += updated.length;
  }
  await markSucceeded(tx, job, { explained, ai: parsed.data.ai });
  return true;
}

type Row = typeof rows.$inferSelect;
const view = (r: Row, doc: RichTextDocument) => ({
  id: r.id,
  text: r.text,
  note: r.note,
  kind: r.kind as LexicalItemKind | null,
  quote: r.quote,
  meaning: r.meaning,
  synonyms: r.synonyms,
  example: r.example,
  ieltsTip: r.ieltsTip,
  status: r.status as "PENDING" | "DRAFT" | "APPROVED",
  // Found in the current script each time, so script edits never leave it stale.
  inText: sentenceWith(doc, r.quote) ?? sentenceWith(doc, r.text),
});

/** The draft's items, in list order, and where the explaining job stands. */
export async function lexicalItemsFor(db: Database, revision: RevisionModel) {
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.siteId, revision.siteId), like(schema.jobs.idempotencyKey, `${prefix(revision.id)}%`)))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);
  const state = !job
    ? ("IDLE" as const)
    : job.status === "SUCCEEDED"
      ? ("DONE" as const)
      : job.status === "FAILED" || job.status === "CANCELLED"
        ? ("FAILED" as const)
        : ("WORKING" as const);
  const items = await db.select().from(rows).where(eq(rows.revisionId, revision.id)).orderBy(asc(rows.position));
  const doc = revision.richText as RichTextDocument;
  return {
    state,
    usedLanguageModel: ((job?.resultJson ?? {}) as { ai?: boolean }).ai ?? null,
    items: items.map((r) => view(r, doc)),
  };
}

/** What learners see: the approved items of a published revision, in list order. */
export async function approvedLexicalItems(db: Database, revision: Pick<RevisionModel, "id" | "richText">) {
  const items = await db
    .select()
    .from(rows)
    .where(and(eq(rows.revisionId, revision.id), eq(rows.status, "APPROVED")))
    .orderBy(asc(rows.position));
  const doc = revision.richText as RichTextDocument;
  return items.map((r) => {
    const v = view(r, doc);
    return { ...v, kind: v.kind ?? "KEYWORD", meaning: v.meaning ?? "" };
  });
}

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

export type LexicalItemApproval = {
  id: string;
  kind: LexicalItemKind;
  meaning: string;
  synonyms: string[];
  example?: string | null;
  ieltsTip?: string | null;
};

/** Editors approve items, with their own edits. */
export async function approveLexicalItems(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  items: LexicalItemApproval[]
) {
  if (!items.length || items.length > MAX_ITEMS) throw invalid(`Choose 1 to ${MAX_ITEMS} items`);
  const clean = items.map((i) => ({
    id: i.id,
    kind: i.kind,
    meaning: clip(i.meaning, LIMIT.meaning + 1),
    synonyms: i.synonyms.map(tidy).filter(Boolean),
    example: clip(i.example, LIMIT.example + 1),
    ieltsTip: clip(i.ieltsTip, LIMIT.tip + 1),
  }));
  if (clean.some((i) => !i.meaning)) throw invalid("Every item needs a meaning");
  if (clean.some((i) => (i.meaning?.length ?? 0) > LIMIT.meaning)) {
    throw invalid(`A meaning can be up to ${LIMIT.meaning} characters`);
  }
  if (clean.some((i) => (i.example?.length ?? 0) > LIMIT.example || (i.ieltsTip?.length ?? 0) > LIMIT.tip)) {
    throw invalid(`An example or tip can be up to ${LIMIT.example} characters`);
  }
  if (clean.some((i) => i.synonyms.length > LIMIT.synonyms || i.synonyms.some((s) => s.length > LIMIT.synonym))) {
    throw invalid(`Up to ${LIMIT.synonyms} synonyms of ${LIMIT.synonym} characters each`);
  }
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    const found = await tx
      .select({ id: rows.id, status: rows.status })
      .from(rows)
      .where(
        and(
          eq(rows.revisionId, draft.id),
          inArray(
            rows.id,
            clean.map((i) => i.id)
          )
        )
      );
    if (found.length !== clean.length) throw notFound("Lexical item");
    const now = new Date();
    for (const item of clean) {
      await tx
        .update(rows)
        .set({
          kind: item.kind,
          meaning: item.meaning,
          synonyms: [...new Set(item.synonyms)],
          example: item.example,
          ieltsTip: item.ieltsTip,
          status: "APPROVED",
          decidedBy: actorUserId,
          decidedAt: now,
        })
        .where(eq(rows.id, item.id));
    }
    await audit(tx, {
      siteId: draft.siteId,
      actorUserId,
      action: "lexical_items.approved",
      entityType: "revision",
      entityId: draft.id,
      data: { items: clean.map((i) => i.id) },
    });
    return clean.length;
  });
}

/** Editors remove items from the lesson's list. */
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
