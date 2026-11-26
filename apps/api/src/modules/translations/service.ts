import { schema, type Database } from "@english/database";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import { conflict, invalid, notFound } from "../../errors";
import type { RevisionModel } from "../../models";
import { one } from "../../rows";
import { audit } from "../audit";
import { enqueue, markSucceeded, type JobRow } from "../jobs/service";
import { isLooking, scriptHash } from "../lexicon/suggestions";
import { lockLocalization } from "../resources/editorial";
import { blockTexts, sentencesOf, type RichTextDocument } from "../rich-text";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const { sentenceTranslations: rows } = schema;

/**
 * Sentence translations for bilingual reading (ADR 0009). An editor picks a language and presses Translate: a
 * background job asks the local language model to translate the script one paragraph at a time, returning one
 * translation per sentence. Editors check, edit and approve each one; learners only ever see approved ones.
 * Whenever the script is saved, translations follow it: unchanged sentences keep theirs (with new offsets if text
 * moved), changed or new sentences are translated again in every language the lesson has, as drafts to check.
 */
export const TRANSLATE_JOB = "translations.translate";
export const TRANSLATION_LOCALES = ["vi", "fr", "de"] as const;
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];
const MAX_TEXT = 4000;

const prefix = (revisionId: string, locale?: string) => `translate:${revisionId}:${locale ? `${locale}:` : ""}`;
const jobKey = (revisionId: string, locale: string, hash: string) => `${prefix(revisionId, locale)}${hash}`;

function checkLocale(locale: string): asserts locale is TranslationLocale {
  if (!(TRANSLATION_LOCALES as readonly string[]).includes(locale)) {
    throw invalid(`Translations are in ${TRANSLATION_LOCALES.join(", ")}`);
  }
}

type Sentence = { blockId: string; start: number; end: number; source: string };

/** The script's sentences, block by block, in reading order. */
export function sentencesOfDoc(doc: RichTextDocument): Sentence[] {
  const out: Sentence[] = [];
  for (const [blockId, text] of blockTexts(doc)) {
    const chars = [...text];
    for (const span of sentencesOf(text)) {
      const source = chars.slice(span.start, span.end).join("");
      if (/\p{L}/u.test(source)) out.push({ blockId, ...span, source });
    }
  }
  return out;
}

const at = (s: { blockId: string; start: number }) => `${s.blockId}:${s.start}`;

/** Asks the worker to translate the sentences that have no translation yet (with their paragraphs, for context). */
async function queueTranslation(
  tx: Tx,
  revision: Pick<RevisionModel, "id" | "siteId" | "richText">,
  locale: TranslationLocale,
  actorUserId: string | null,
  again = false
) {
  const doc = revision.richText as RichTextDocument;
  const sentences = sentencesOfDoc(doc);
  const have = await tx
    .select({ blockId: rows.blockId, start: rows.start, sourceText: rows.sourceText })
    .from(rows)
    .where(and(eq(rows.revisionId, revision.id), eq(rows.locale, locale)));
  const done = new Set(have.map((h) => `${at(h)}:${h.sourceText}`));
  const missing = sentences.filter((s) => !done.has(`${at(s)}:${s.source}`));
  if (!missing.length) return null;
  const blocks = new Set(missing.map((s) => s.blockId));
  const paragraphs = [...blocks].map((blockId) => ({
    blockId,
    sentences: sentences
      .filter((s) => s.blockId === blockId)
      .map((s) => ({ start: s.start, end: s.end, text: s.source })),
  }));
  const hash = scriptHash(doc);
  return enqueue(tx, {
    siteId: revision.siteId,
    type: TRANSLATE_JOB,
    idempotencyKey: again ? `${jobKey(revision.id, locale, hash)}:${Date.now()}` : jobKey(revision.id, locale, hash),
    createdBy: actorUserId,
    maxAttempts: 2,
    payload: { revisionId: revision.id, locale, textHash: hash, paragraphs },
  });
}

/** The languages this draft has been translated into (or is being translated into). */
async function languagesOf(tx: Tx, siteId: string, revisionId: string): Promise<TranslationLocale[]> {
  const jobs = await tx
    .select({ key: schema.jobs.idempotencyKey })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.siteId, siteId), like(schema.jobs.idempotencyKey, `${prefix(revisionId)}%`)));
  const kept = await tx.selectDistinct({ locale: rows.locale }).from(rows).where(eq(rows.revisionId, revisionId));
  const found = new Set([...jobs.map((j) => j.key.split(":")[2] ?? ""), ...kept.map((k) => k.locale)]);
  return TRANSLATION_LOCALES.filter((l) => found.has(l));
}

/**
 * After the script is saved: each translation stays with its sentence if that sentence is still there (offsets
 * updated when text before it moved), or goes. Then every language the lesson has is translated again for the
 * sentences left without one.
 */
export async function syncTranslations(
  tx: Tx,
  revision: Pick<RevisionModel, "id" | "siteId">,
  doc: RichTextDocument,
  actorUserId: string | null
) {
  const languages = await languagesOf(tx, revision.siteId, revision.id);
  if (!languages.length) return;
  const sentences = sentencesOfDoc(doc);
  const existing = await tx.select().from(rows).where(eq(rows.revisionId, revision.id));
  const kept: (typeof existing)[number][] = [];
  for (const locale of languages) {
    const taken = new Set<string>();
    for (const row of existing.filter((r) => r.locale === locale)) {
      // The same sentence in the same paragraph; if it appears twice, the one nearest its old place.
      const match = sentences
        .filter((s) => s.blockId === row.blockId && s.source === row.sourceText && !taken.has(at(s)))
        .sort((a, b) => Math.abs(a.start - row.start) - Math.abs(b.start - row.start))[0];
      if (!match) continue;
      taken.add(at(match));
      kept.push({ ...row, start: match.start, end: match.end });
    }
  }
  // Replaced in one go: moving offsets one row at a time could collide on the unique (block, start).
  await tx.delete(rows).where(eq(rows.revisionId, revision.id));
  if (kept.length) await tx.insert(rows).values(kept);
  const current = { ...revision, richText: doc };
  for (const locale of languages) await queueTranslation(tx, current, locale, actorUserId);
}

/** A new draft starts with the published revision's translations. */
export async function copyTranslations(tx: Tx, fromRevisionId: string, toRevisionId: string) {
  const from = await tx.select().from(rows).where(eq(rows.revisionId, fromRevisionId));
  if (from.length) {
    await tx.insert(rows).values(from.map(({ id: _id, ...r }) => ({ ...r, revisionId: toRevisionId })));
  }
}

/** The draft's sentences in one language, each with its translation (if any), and the translation job's state. */
export async function translationsFor(db: Database, revision: RevisionModel, locale: string) {
  checkLocale(locale);
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.siteId, revision.siteId), like(schema.jobs.idempotencyKey, `${prefix(revision.id, locale)}%`))
    )
    .orderBy(desc(schema.jobs.createdAt))
    .limit(1);
  const state = !job
    ? ("IDLE" as const)
    : job.status === "SUCCEEDED"
      ? ("DONE" as const)
      : job.status === "FAILED" || job.status === "CANCELLED"
        ? ("FAILED" as const)
        : ("WORKING" as const);
  const have = await db
    .select()
    .from(rows)
    .where(and(eq(rows.revisionId, revision.id), eq(rows.locale, locale)));
  const byPlace = new Map(have.map((h) => [at(h), h]));
  const sentences = sentencesOfDoc(revision.richText as RichTextDocument).map((s) => {
    const t = byPlace.get(at(s));
    return {
      ...s,
      translation: t && t.sourceText === s.source ? { id: t.id, text: t.text, status: t.status } : null,
    };
  });
  return {
    locale,
    state,
    usedLanguageModel: ((job?.resultJson ?? {}) as { ai?: boolean }).ai ?? null,
    sentences,
  };
}

/** What learners see: the approved translations of a published revision. */
export async function approvedTranslations(db: Database, revisionId: string) {
  return db
    .select({ locale: rows.locale, blockId: rows.blockId, start: rows.start, end: rows.end, text: rows.text })
    .from(rows)
    .where(and(eq(rows.revisionId, revisionId), eq(rows.status, "APPROVED")));
}

const result = z.strictObject({
  ai: z.boolean(),
  items: z
    .array(z.strictObject({ blockId: z.string().max(200), start: z.number().int().min(0), text: z.string() }))
    .max(5000),
});

/** The worker's translations: kept as drafts for sentences that are still the ones it was asked about. */
export async function completeTranslateJob(tx: Tx, job: JobRow, raw: unknown) {
  const parsed = result.safeParse(raw);
  if (!parsed.success) throw invalid("The job's result isn't valid");
  const payload = job.payloadJson as {
    revisionId: string;
    locale: TranslationLocale;
    paragraphs: { blockId: string; sentences: { start: number; text: string }[] }[];
  };
  const [revision] = await tx
    .select()
    .from(schema.resourceRevisions)
    .where(eq(schema.resourceRevisions.id, payload.revisionId));
  if (!revision || revision.status !== "DRAFT") {
    await markSucceeded(tx, job, { stale: true, ai: parsed.data.ai });
    return true;
  }
  // Only sentences that still read exactly as they did when the job was queued (the script may have changed).
  const asked = new Map(payload.paragraphs.flatMap((p) => p.sentences.map((s) => [`${p.blockId}:${s.start}`, s.text])));
  const now = new Map(sentencesOfDoc(revision.richText as RichTextDocument).map((s) => [at(s), s]));
  const values = parsed.data.items.flatMap((item) => {
    const sentence = now.get(at(item));
    const text = item.text.replace(/\s+/g, " ").trim();
    if (!sentence || asked.get(at(item)) !== sentence.source || !text || text.length > MAX_TEXT) return [];
    return [
      {
        siteId: revision.siteId,
        revisionId: revision.id,
        locale: payload.locale,
        blockId: sentence.blockId,
        start: sentence.start,
        end: sentence.end,
        sourceText: sentence.source,
        text,
      },
    ];
  });
  // A sentence that already has a translation (an editor's, or approved) keeps it.
  if (values.length) await tx.insert(rows).values(values).onConflictDoNothing();
  await markSucceeded(tx, job, { translated: values.length, ai: parsed.data.ai });
  return true;
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

/** "Translate" (or again): drafts translations for the sentences without one. `redo` first drops unapproved ones. */
export async function translateDraft(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  locale: string,
  redo: boolean
) {
  checkLocale(locale);
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    if (await isLooking(tx, draft.siteId, prefix(draft.id, locale))) {
      throw conflict("This language is already being translated");
    }
    if (!sentencesOfDoc(draft.richText as RichTextDocument).length) {
      throw invalid("Write the script first: there's nothing to translate");
    }
    if (redo) {
      await tx
        .delete(rows)
        .where(and(eq(rows.revisionId, draft.id), eq(rows.locale, locale), eq(rows.status, "DRAFT")));
    }
    const job = await queueTranslation(tx, draft, locale, actorUserId, true);
    if (!job) throw conflict("Every sentence already has a translation");
    return true;
  });
}

/** Editors approve translations, with their own edits. Learners can't change anything. */
export async function approveTranslations(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  items: { id: string; text: string }[]
) {
  if (!items.length || items.length > 1000) throw invalid("Choose 1 to 1000 translations");
  const clean = items.map((i) => ({ id: i.id, text: i.text.replace(/\s+/g, " ").trim() }));
  if (clean.some((i) => !i.text)) throw invalid("A translation can't be empty");
  if (clean.some((i) => i.text.length > MAX_TEXT)) throw invalid(`A translation can be up to ${MAX_TEXT} characters`);
  return db.transaction(async (tx) => {
    const draft = await editableDraft(tx, localizationId);
    const found = await tx
      .select({ id: rows.id })
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
    if (found.length !== clean.length) throw notFound("Translation");
    const now = new Date();
    for (const item of clean) {
      await tx
        .update(rows)
        .set({ text: item.text, status: "APPROVED", decidedBy: actorUserId, decidedAt: now })
        .where(eq(rows.id, item.id));
    }
    await audit(tx, {
      siteId: draft.siteId,
      actorUserId,
      action: "translations.approved",
      entityType: "revision",
      entityId: draft.id,
      data: { translations: clean.map((i) => i.id) },
    });
    return clean.length;
  });
}
