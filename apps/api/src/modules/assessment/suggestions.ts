import { schema, type Database } from "@english/database";
import { and, asc, desc, eq, inArray, like, ne } from "drizzle-orm";
import { z } from "zod";
import { conflict, invalid, notFound, translateDbErrors } from "../../errors";
import type { RevisionModel } from "../../models";
import { one } from "../../rows";
import { audit } from "../audit";
import { enqueue, markSucceeded, type JobRow } from "../jobs/service";
import { scriptHash } from "../lexicon/suggestions";
import { draftOf, lockLocalization } from "../resources/editorial";
import { blockTexts, type RichTextDocument } from "../rich-text";
import { exerciseSetsForEditing, replaceExerciseSets } from "./service";
import { checkConsistency, questionInput, type Question, type QuestionInput } from "./schemas";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const { questionSuggestions: drafts } = schema;

/**
 * Suggested questions (ADR 0008). Saving a draft's script queues a background job; the worker asks the local
 * language model for IELTS-style questions about it and sends them back. Each is checked like an editor's
 * question, plus: typed answers must come from the script. Editors approve each one (it joins the draft's
 * exercises, in a set per question type with the IELTS instructions) or remove it.
 */
export const QUESTIONS_JOB = "questions.suggest";
const MAX_DRAFTS = 30;

const jobKey = (revisionId: string, hash: string) => `questions:${revisionId}:${hash}`;

/** Paragraph letters, as IELTS labels them (A, B, C...), for matching questions. */
export const paragraphLetter = (i: number) => String.fromCharCode(65 + (i % 26));

export async function queueQuestionSuggestions(
  tx: Tx,
  revision: Pick<RevisionModel, "id" | "siteId" | "cefrLevel">,
  doc: RichTextDocument,
  actorUserId: string | null,
  again = false
) {
  const hash = scriptHash(doc);
  await tx
    .delete(drafts)
    .where(and(eq(drafts.revisionId, revision.id), eq(drafts.status, "PENDING"), ne(drafts.textHash, hash)));
  const blocks = [...blockTexts(doc)]
    .filter(([, text]) => text.trim())
    .map(([blockId, text], i) => ({ blockId, letter: paragraphLetter(i), text }));
  // A sentence or two isn't enough to ask about.
  if (
    blocks
      .map((b) => b.text)
      .join(" ")
      .split(/\s+/).length < 25
  )
    return null;
  return enqueue(tx, {
    siteId: revision.siteId,
    type: QUESTIONS_JOB,
    idempotencyKey: again ? `${jobKey(revision.id, hash)}:${Date.now()}` : jobKey(revision.id, hash),
    createdBy: actorUserId,
    maxAttempts: 2,
    payload: { revisionId: revision.id, textHash: hash, level: revision.cefrLevel ?? null, blocks },
  });
}

export async function questionSuggestionsFor(db: Database, revision: RevisionModel) {
  const hash = scriptHash(revision.richText as RichTextDocument);
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.siteId, revision.siteId), like(schema.jobs.idempotencyKey, `${jobKey(revision.id, hash)}%`))
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
  const items = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.revisionId, revision.id), eq(drafts.textHash, hash)))
    .orderBy(asc(drafts.position));
  return { state, usedLanguageModel: ((job?.resultJson ?? {}) as { ai?: boolean }).ai ?? null, items };
}

const result = z.strictObject({ ai: z.boolean(), questions: z.array(z.unknown()).max(100) });

const plain = (text: string) =>
  text.normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");

/** Typed answers (completion, short answer) must be words from the script, as IELTS requires. */
function answersFromText(q: Question, script: string): boolean {
  const answers =
    q.type === "COMPLETION" || q.type === "GAP_FILL"
      ? q.grading.gaps.flatMap((g) => g.accepted)
      : q.type === "SHORT_ANSWER"
        ? q.grading.accepted
        : [];
  return answers.every((a) => script.includes(plain(a)));
}

export async function completeQuestionJob(tx: Tx, job: JobRow, raw: unknown) {
  const parsed = result.safeParse(raw);
  if (!parsed.success) throw invalid("The job's result isn't valid");
  const payload = job.payloadJson as { revisionId: string; textHash: string };
  const [revision] = await tx
    .select()
    .from(schema.resourceRevisions)
    .where(eq(schema.resourceRevisions.id, payload.revisionId));
  const doc = revision?.richText as RichTextDocument | undefined;
  if (!revision || revision.status !== "DRAFT" || !doc || scriptHash(doc) !== payload.textHash) {
    await markSucceeded(tx, job, { stale: true, ai: parsed.data.ai });
    return true;
  }
  const script = plain([...blockTexts(doc).values()].join(" "));
  const keep: Question[] = [];
  for (const candidate of parsed.data.questions) {
    const q = questionInput.safeParse(candidate);
    if (!q.success || checkConsistency(q.data) || !answersFromText(q.data, script)) continue;
    keep.push(q.data);
    if (keep.length >= MAX_DRAFTS) break;
  }
  const [{ last } = { last: 0 }] = await tx
    .select({ last: drafts.position })
    .from(drafts)
    .where(eq(drafts.revisionId, revision.id))
    .orderBy(desc(drafts.position))
    .limit(1);
  if (keep.length) {
    await tx.insert(drafts).values(
      keep.map((q, i) => ({
        siteId: revision.siteId,
        revisionId: revision.id,
        type: q.type,
        questionJson: q,
        textHash: payload.textHash,
        position: (last ?? 0) + i + 1,
      }))
    );
  }
  await markSucceeded(tx, job, {
    questions: keep.length,
    dropped: parsed.data.questions.length - keep.length,
    ai: parsed.data.ai,
  });
  return true;
}

/** The exercise set an approved question joins: one per IELTS task type, with its standard instructions. */
export function setFor(q: QuestionInput): { title: string; instructions: string } {
  switch (q.type) {
    case "SINGLE_CHOICE":
      return { title: "Multiple choice", instructions: "Choose the correct letter, A, B, C or D." };
    case "MULTIPLE_CHOICE":
      return { title: "Multiple choice: more than one answer", instructions: "Choose the correct letters." };
    case "TRUE_FALSE_NOT_GIVEN":
      return {
        title: "True / False / Not Given",
        instructions:
          "Do the following statements agree with the information given in the text? Choose TRUE if the statement agrees with the information, FALSE if it contradicts the information, NOT GIVEN if there is no information on this.",
      };
    case "YES_NO_NOT_GIVEN":
      return {
        title: "Yes / No / Not Given",
        instructions:
          "Do the following statements agree with the views of the writer? Choose YES if the statement agrees with the views of the writer, NO if it contradicts them, NOT GIVEN if it is impossible to say what the writer thinks about this.",
      };
    case "MATCHING":
      return {
        HEADINGS: {
          title: "Matching headings",
          instructions: "Choose the correct heading for each paragraph from the list of headings.",
        },
        INFORMATION: {
          title: "Matching information",
          instructions: "Which paragraph contains the following information? You may use any letter more than once.",
        },
        FEATURES: { title: "Matching features", instructions: "Match each statement with the correct option." },
        SENTENCE_ENDINGS: {
          title: "Matching sentence endings",
          instructions: "Complete each sentence with the correct ending.",
        },
      }[q.prompt.variant];
    case "COMPLETION":
      return {
        title: { SENTENCE: "Sentence completion", SUMMARY: "Summary completion", NOTE: "Note completion" }[
          q.prompt.variant
        ],
        instructions: "Complete the text below. Choose your answers from the text, within the word limit given.",
      };
    case "SHORT_ANSWER":
      return {
        title: "Short-answer questions",
        instructions: "Answer the questions below. Choose your answers from the text, within the word limit given.",
      };
    case "GAP_FILL":
      return { title: "Fill in the gaps", instructions: "Complete the text." };
  }
}

/** Adds the chosen drafts to the draft's exercises (in their task type's set), as if an editor had written them. */
export async function approveQuestionSuggestions(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  lockVersion: number,
  ids: string[]
) {
  if (!ids.length || ids.length > 100) throw invalid("Choose 1 to 100 questions");
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const l = await lockLocalization(tx, localizationId);
      const draft = await draftOf(tx, l.draftRevisionId, lockVersion);
      if (draft.status !== "DRAFT") throw conflict("The draft is in review; a reviewer must return it first");
      const chosen = await tx
        .select()
        .from(drafts)
        .where(and(eq(drafts.revisionId, draft.id), inArray(drafts.id, ids), eq(drafts.status, "PENDING")))
        .orderBy(asc(drafts.position));
      if (!chosen.length) throw notFound("Suggested question");
      if (chosen.some((c) => c.textHash !== scriptHash(draft.richText as RichTextDocument))) {
        throw conflict("The script changed after these were drafted: save it again for new questions");
      }
      const sets = await exerciseSetsForEditing(tx, draft.id);
      for (const c of chosen) {
        const question = c.questionJson as QuestionInput;
        const target = setFor(question);
        let set = sets.find((s) => s.title === target.title);
        if (!set) {
          set = { ...target, questions: [] };
          sets.push(set);
        }
        set.questions.push(question);
      }
      await replaceExerciseSets(tx, l.siteId, draft.id, sets);
      await tx
        .update(schema.resourceRevisions)
        .set({ lockVersion: draft.lockVersion + 1 })
        .where(eq(schema.resourceRevisions.id, draft.id));
      await tx
        .update(drafts)
        .set({ status: "APPROVED", decidedBy: actorUserId, decidedAt: new Date() })
        .where(
          inArray(
            drafts.id,
            chosen.map((c) => c.id)
          )
        );
      await audit(tx, {
        siteId: l.siteId,
        actorUserId,
        action: "questions.approved",
        entityType: "revision",
        entityId: draft.id,
        data: { suggestions: chosen.map((c) => c.id) },
      });
      return l.resourceId;
    })
  );
}

export async function rejectQuestionSuggestions(
  db: Database,
  actorUserId: string | null,
  localizationId: string,
  ids: string[]
) {
  if (!ids.length || ids.length > 100) throw invalid("Choose 1 to 100 questions");
  return db.transaction(async (tx) => {
    const l = await lockLocalization(tx, localizationId);
    if (!l.draftRevisionId) throw conflict("There's no draft: start one first");
    await tx
      .update(drafts)
      .set({ status: "REJECTED", decidedBy: actorUserId, decidedAt: new Date() })
      .where(and(eq(drafts.revisionId, l.draftRevisionId), inArray(drafts.id, ids), eq(drafts.status, "PENDING")));
    return true;
  });
}

export async function suggestQuestionsAgain(db: Database, actorUserId: string | null, localizationId: string) {
  return db.transaction(async (tx) => {
    const l = await lockLocalization(tx, localizationId);
    if (!l.draftRevisionId) throw conflict("There's no draft: start one first");
    const draft = one(
      await tx.select().from(schema.resourceRevisions).where(eq(schema.resourceRevisions.id, l.draftRevisionId))
    );
    const job = await queueQuestionSuggestions(tx, draft, draft.richText as RichTextDocument, actorUserId, true);
    if (!job) throw invalid("The script is too short to ask questions about");
    return true;
  });
}
