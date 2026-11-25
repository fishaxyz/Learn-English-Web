import { createHash } from "node:crypto";
import { schema, type Database } from "@english/database";
import { and, asc, desc, eq, inArray, isNotNull, like, ne, or } from "drizzle-orm";
import { z } from "zod";
import { conflict, invalid, notFound, translateDbErrors } from "../../errors";
import type { RevisionModel } from "../../models";
import { one } from "../../rows";
import { audit } from "../audit";
import { enqueue, markSucceeded, type JobRow } from "../jobs/service";
import { draftOf, lockLocalization, writeAnnotations } from "../resources/editorial";
import {
  annotationsOf,
  blockTexts,
  plainTextOf,
  sentenceAround,
  type RichTextDocument,
  type RichTextNode,
} from "../rich-text";
import { normalizeHeadword } from "./service";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Kind = (typeof schema.lexicalEntryKind.enumValues)[number];
type Level = (typeof schema.cefrLevel.enumValues)[number];
const { vocabularySuggestions: suggestions, lexicalEntries: entries, lexicalSenses: senses } = schema;

/**
 * Vocabulary suggestions (ADR 0007). Saving a draft's script queues a background job; the worker finds words,
 * phrasal verbs, idioms, collocations and patterns worth learning (spaCy, word frequency, the local language
 * model) and sends them back. Editors approve each one, which links it in the text as a key word, or remove it.
 */
export const VOCAB_JOB = "vocab.suggest";
const MAX_SUGGESTIONS = 40;

/** The text the suggestions were made for: each block's id and text, in order. */
export function scriptHash(doc: RichTextDocument): string {
  return createHash("sha256")
    .update(JSON.stringify([...blockTexts(doc)]))
    .digest("hex");
}

const jobKey = (revisionId: string, hash: string) => `vocab:${revisionId}:${hash}`;

/**
 * Asks the worker for suggestions for the draft's current text (once per text: the same text never queues a
 * second job unless `again`). Pending suggestions for an older text are dropped; decisions are kept.
 */
export async function queueSuggestions(
  tx: Tx,
  revision: Pick<RevisionModel, "id" | "siteId" | "cefrLevel">,
  doc: RichTextDocument,
  actorUserId: string | null,
  again = false
) {
  const hash = scriptHash(doc);
  await tx
    .delete(suggestions)
    .where(
      and(eq(suggestions.revisionId, revision.id), eq(suggestions.status, "PENDING"), ne(suggestions.textHash, hash))
    );
  const blocks = [...blockTexts(doc)].filter(([, text]) => text.trim()).map(([blockId, text]) => ({ blockId, text }));
  if (!blocks.length) return null;
  return enqueue(tx, {
    siteId: revision.siteId,
    type: VOCAB_JOB,
    idempotencyKey: again ? `${jobKey(revision.id, hash)}:${Date.now()}` : jobKey(revision.id, hash),
    createdBy: actorUserId,
    // Language-model replies can be slow or odd: two tries, then the editor can ask again.
    maxAttempts: 2,
    payload: { revisionId: revision.id, textHash: hash, level: revision.cefrLevel ?? null, blocks },
  });
}

export type SuggestionsState = "IDLE" | "WORKING" | "DONE" | "FAILED";

/** Where suggestions for the revision's current text stand, and the suggestions themselves. */
export async function suggestionsFor(db: Database, revision: RevisionModel) {
  const hash = scriptHash(revision.richText as RichTextDocument);
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.siteId, revision.siteId), like(schema.jobs.idempotencyKey, `${jobKey(revision.id, hash)}%`))
    )
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);
  const state: SuggestionsState = !job
    ? "IDLE"
    : job.status === "SUCCEEDED"
      ? "DONE"
      : job.status === "FAILED" || job.status === "CANCELLED"
        ? "FAILED"
        : "WORKING";
  const items = await db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.revisionId, revision.id), eq(suggestions.textHash, hash)))
    .orderBy(asc(suggestions.blockId), asc(suggestions.start));
  const order = [...blockTexts(revision.richText as RichTextDocument).keys()];
  items.sort((a, b) => order.indexOf(a.blockId) - order.indexOf(b.blockId) || a.start - b.start);
  const result = (job?.resultJson ?? {}) as { ai?: boolean };
  return { state, usedLanguageModel: result.ai ?? null, items };
}

// --- The worker's result

const KINDS = schema.lexicalEntryKind.enumValues;
const suggestionResult = z.strictObject({
  /** Whether the language model took part (false: it wasn't reachable, so only word-frequency suggestions). */
  ai: z.boolean(),
  suggestions: z
    .array(
      z.strictObject({
        kind: z.enum(KINDS),
        displayForm: z.string().trim().min(1).max(120),
        partOfSpeech: z.string().regex(/^[a-z][a-z -]{0,29}$/),
        blockId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        start: z.number().int().min(0),
        end: z.number().int().min(1),
        surfaceText: z.string().min(1).max(300),
        definition: z.string().trim().min(1).max(500).nullable(),
        cefrLevel: z.enum(schema.cefrLevel.enumValues).nullable(),
        zipf: z.number().min(0).max(10).nullable(),
        source: z.enum(["nlp", "ai"]),
      })
    )
    .max(200),
});

const overlaps = (
  a: { blockId: string; start: number; end: number },
  b: { blockId: string; start: number; end: number }
) => a.blockId === b.blockId && a.start < b.end && b.start < a.end;

/**
 * Stores what the worker found, if the text is still the one it read: only spans that really say that text, don't
 * overlap a link or another suggestion, and weren't removed before. Each is matched to the word bank.
 */
export async function completeSuggestJob(tx: Tx, job: JobRow, result: unknown) {
  const parsed = suggestionResult.safeParse(result);
  if (!parsed.success) throw invalid("The job's result isn't valid");
  const payload = job.payloadJson as { revisionId: string; textHash: string };
  const [revision] = await tx
    .select()
    .from(schema.resourceRevisions)
    .where(eq(schema.resourceRevisions.id, payload.revisionId));
  const doc = revision?.richText as RichTextDocument | undefined;
  if (!revision || revision.status !== "DRAFT" || !doc || scriptHash(doc) !== payload.textHash) {
    await markSucceeded(tx, job, { stale: true, ai: parsed.data.ai });
    return true; // the text changed meanwhile: a newer job reads the new text
  }
  const texts = blockTexts(doc);
  const links = annotationsOf(doc);
  const existing = await tx.select().from(suggestions).where(eq(suggestions.revisionId, revision.id));
  const removed = new Set(existing.filter((s) => s.status === "REJECTED").map((s) => s.normalizedForm));
  const taken = [...links, ...existing.filter((s) => s.textHash === payload.textHash)];
  const seenForms = new Set(existing.filter((s) => s.textHash === payload.textHash).map((s) => s.normalizedForm));

  const keep: (z.infer<typeof suggestionResult>["suggestions"][number] & {
    normalizedForm: string;
    sentence: string;
  })[] = [];
  for (const s of parsed.data.suggestions) {
    const text = texts.get(s.blockId);
    if (!text || s.end <= s.start || [...text].slice(s.start, s.end).join("") !== s.surfaceText) continue;
    const normalizedForm = normalizeHeadword(s.displayForm);
    if (removed.has(normalizedForm) || seenForms.has(normalizedForm)) continue;
    if (taken.some((t) => overlaps(t, s)) || keep.some((k) => overlaps(k, s))) continue;
    keep.push({ ...s, normalizedForm, sentence: sentenceAround(text, s.start, s.end).slice(0, 500) });
    seenForms.add(normalizedForm);
    if (keep.length >= MAX_SUGGESTIONS) break;
  }

  // Already in the word bank: a published sense first, else a draft one (added by an earlier approval).
  const known = keep.length
    ? await tx
        .select({
          form: entries.normalizedHeadword,
          published: senses.publishedRevisionId,
          draft: senses.draftRevisionId,
        })
        .from(entries)
        .innerJoin(senses, eq(senses.entryId, entries.id))
        .where(
          and(
            eq(entries.siteId, revision.siteId),
            inArray(entries.normalizedHeadword, [...new Set(keep.map((k) => k.normalizedForm))]),
            or(isNotNull(senses.publishedRevisionId), isNotNull(senses.draftRevisionId))
          )
        )
    : [];
  const senseFor = (form: string) => {
    const matches = known.filter((k) => k.form === form);
    return matches.find((m) => m.published)?.published ?? matches[0]?.draft ?? null;
  };

  if (keep.length) {
    await tx.insert(suggestions).values(
      keep.map((s) => ({
        siteId: revision.siteId,
        revisionId: revision.id,
        kind: s.kind,
        displayForm: s.displayForm,
        normalizedForm: s.normalizedForm,
        partOfSpeech: s.partOfSpeech,
        blockId: s.blockId,
        start: s.start,
        end: s.end,
        surfaceText: s.surfaceText,
        sentence: s.sentence,
        definition: s.definition,
        cefrLevel: s.cefrLevel as Level | null,
        zipf: s.zipf,
        source: s.source,
        senseRevisionId: senseFor(s.normalizedForm),
        textHash: payload.textHash,
      }))
    );
  }
  await markSucceeded(tx, job, { suggestions: keep.length, ai: parsed.data.ai });
  return true;
}

// --- Editors' decisions

/** The text with a lexical (vocabulary) mark over code points [start, end) of a block, splitting text nodes. */
export function addLexicalMark(
  doc: RichTextDocument,
  span: { blockId: string; start: number; end: number },
  attrs: { senseRevisionId: string; key: boolean }
): RichTextDocument {
  let applied = false;
  const visit = (node: RichTextNode): RichTextNode => {
    if (node.attrs?.["id"] === span.blockId && node.content?.some((c) => c.type === "text" || c.type === "hardBreak")) {
      let offset = 0;
      const content: RichTextNode[] = [];
      for (const child of node.content) {
        if (child.type !== "text") {
          offset += child.type === "hardBreak" ? 1 : 0;
          content.push(child);
          continue;
        }
        const chars = [...(child.text ?? "")];
        const from = Math.max(0, span.start - offset);
        const to = Math.min(chars.length, span.end - offset);
        if (from >= to) {
          content.push(child);
        } else {
          const marks = (child.marks ?? []).filter((m) => m.type !== "lexical");
          const piece = (text: string, withMark: boolean): RichTextNode => ({
            ...child,
            text,
            marks: withMark ? [...marks, { type: "lexical", attrs }] : child.marks,
          });
          if (from > 0) content.push(piece(chars.slice(0, from).join(""), false));
          content.push(piece(chars.slice(from, to).join(""), true));
          if (to < chars.length) content.push(piece(chars.slice(to).join(""), false));
          applied = true;
        }
        offset += chars.length;
      }
      return { ...node, content: content.map((c) => (c.marks?.length === 0 ? { ...c, marks: undefined } : c)) };
    }
    return node.content ? { ...node, content: node.content.map(visit) } : node;
  };
  const out = { ...doc, content: doc.content.map(visit) };
  if (!applied) throw conflict("That part of the text has changed: save the script again for new suggestions");
  return JSON.parse(JSON.stringify(out)) as RichTextDocument; // drops the undefined marks
}

const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";

/** A word-bank entry and draft sense for a new item: the suggested meaning, to be checked in Lexical Studio. */
async function addDraftSense(tx: Tx, actorUserId: string | null, s: typeof suggestions.$inferSelect) {
  const [entry] = await tx
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.siteId, s.siteId),
        eq(entries.normalizedHeadword, s.normalizedForm),
        eq(entries.kind, s.kind as Kind)
      )
    )
    .limit(1);
  const entryId =
    entry?.id ??
    one(
      await tx
        .insert(entries)
        .values({
          siteId: s.siteId,
          displayForm: s.displayForm,
          normalizedHeadword: s.normalizedForm,
          kind: s.kind as Kind,
        })
        .returning({ id: entries.id })
    ).id;
  const sense = one(
    await tx
      .insert(senses)
      .values({
        siteId: s.siteId,
        entryId,
        partOfSpeech: s.partOfSpeech,
        senseKey: `${slug(s.displayForm)}-${slug(s.partOfSpeech)}-${s.id.slice(0, 6)}`,
      })
      .returning()
  );
  const revision = one(
    await tx
      .insert(schema.lexicalSenseRevisions)
      .values({
        siteId: s.siteId,
        senseId: sense.id,
        revisionNo: 1,
        createdBy: actorUserId,
        definitionEn: s.definition ?? "Meaning to be written.",
        cefrLevel: s.cefrLevel,
        usageNote: "Suggested for a lesson: check the meaning before publishing.",
      })
      .returning()
  );
  await tx.insert(schema.lexicalExamples).values({ senseRevisionId: revision.id, sentence: s.sentence, position: 0 });
  await tx.update(senses).set({ draftRevisionId: revision.id }).where(eq(senses.id, sense.id));
  await audit(tx, {
    siteId: s.siteId,
    actorUserId,
    action: "sense.created",
    entityType: "lexical_sense",
    entityId: sense.id,
    data: { fromSuggestion: s.id },
  });
  return revision.id;
}

/**
 * Approves suggestions: each is linked in the draft's text as a key word (bold in the editor, shown first to
 * learners). An item new to the word bank is added there as a draft sense with the suggested meaning; the lesson
 * can't be published until that sense is checked and published (publishResource refuses unpublished senses).
 */
export async function approveSuggestions(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  lockVersion: number,
  ids: string[]
) {
  if (!ids.length || ids.length > 100) throw invalid("Choose 1 to 100 suggestions");
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const l = await lockLocalization(tx, localizationId);
      const draft = await draftOf(tx, l.draftRevisionId, lockVersion);
      if (draft.status !== "DRAFT") throw conflict("The draft is in review; a reviewer must return it first");
      let doc = draft.richText as RichTextDocument;
      const hash = scriptHash(doc);
      const chosen = await tx
        .select()
        .from(suggestions)
        .where(
          and(eq(suggestions.revisionId, draft.id), inArray(suggestions.id, ids), eq(suggestions.status, "PENDING"))
        );
      if (!chosen.length) throw notFound("Suggestion");
      if (chosen.some((s) => s.textHash !== hash)) {
        throw conflict("The text changed after these were suggested: save the script again for new suggestions");
      }
      for (const s of chosen) {
        if (annotationsOf(doc).some((a) => overlaps(a, s))) {
          throw conflict(`“${s.surfaceText}” overlaps a word that's already linked`);
        }
        const senseRevisionId = s.senseRevisionId ?? (await addDraftSense(tx, actorUserId, s));
        doc = addLexicalMark(doc, s, { senseRevisionId, key: true });
        await tx
          .update(suggestions)
          .set({ status: "APPROVED", senseRevisionId, decidedBy: actorUserId, decidedAt: new Date() })
          .where(eq(suggestions.id, s.id));
      }
      await tx
        .update(schema.resourceRevisions)
        .set({ richText: doc, plainText: plainTextOf(doc), lockVersion: draft.lockVersion + 1 })
        .where(eq(schema.resourceRevisions.id, draft.id));
      await writeAnnotations(tx, l.siteId, draft.id, doc);
      await audit(tx, {
        siteId: l.siteId,
        actorUserId,
        action: "vocabulary.approved",
        entityType: "revision",
        entityId: draft.id,
        data: { suggestions: chosen.map((s) => s.id) },
      });
      return l.resourceId;
    })
  );
}

/** Removes suggestions from the list; the same item isn't suggested again for this lesson. */
export async function rejectSuggestions(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  ids: string[]
) {
  if (!ids.length || ids.length > 100) throw invalid("Choose 1 to 100 suggestions");
  return db.transaction(async (tx) => {
    const l = await lockLocalization(tx, localizationId);
    if (!l.draftRevisionId) throw conflict("There's no draft: start one first");
    await tx
      .update(suggestions)
      .set({ status: "REJECTED", decidedBy: actorUserId, decidedAt: new Date() })
      .where(
        and(
          eq(suggestions.revisionId, l.draftRevisionId),
          inArray(suggestions.id, ids),
          eq(suggestions.status, "PENDING")
        )
      );
    return true;
  });
}

/** "Suggest again": a fresh job for the current text (the previous one failed, or the editor wants another try). */
export async function suggestAgain(db: Database, actorUserId: string | null, localizationId: string) {
  return db.transaction(async (tx) => {
    const l = await lockLocalization(tx, localizationId);
    if (!l.draftRevisionId) throw conflict("There's no draft: start one first");
    const draft = one(
      await tx.select().from(schema.resourceRevisions).where(eq(schema.resourceRevisions.id, l.draftRevisionId))
    );
    const job = await queueSuggestions(tx, draft, draft.richText as RichTextDocument, actorUserId, true);
    if (!job) throw invalid("Write the script first");
    return true;
  });
}
