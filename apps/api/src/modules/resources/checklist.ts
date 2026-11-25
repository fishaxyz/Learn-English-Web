import { schema, type Database } from "@english/database";
import { and, eq, sql } from "drizzle-orm";
import { conflict } from "../../errors";
import { ttsTextOf } from "../audio/service";
import type { RichTextDocument } from "../rich-text";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * The four parts of a reading lesson. A lesson can be saved at any time, but it's only sent for review or published
 * once every required part is finished (ADR 0006).
 */
export const LESSON_PARTS = ["SCRIPT", "VOICEOVER", "VOCABULARY", "QUESTIONS"] as const;
export type LessonPart = (typeof LESSON_PARTS)[number];
export type Checklist = Record<LessonPart, boolean>;

const LABEL: Record<LessonPart, string> = {
  SCRIPT: "script",
  VOICEOVER: "an approved voice-over",
  VOCABULARY: "linked vocabulary",
  QUESTIONS: "questions",
};

/** Whether each part is finished, from what's stored for the revision. */
export function checklistFrom(p: {
  plainText: string;
  richText: unknown;
  tracks: { status: string; textHash: string }[];
  linkedSenses: number;
  questions: number;
}): Checklist {
  const hash = ttsTextOf(p.richText as RichTextDocument).hash;
  return {
    SCRIPT: p.plainText.trim().length > 0,
    // Approved and still reading the current text.
    VOICEOVER: p.tracks.some((t) => t.status === "APPROVED" && t.textHash === hash),
    VOCABULARY: p.linkedSenses > 0,
    QUESTIONS: p.questions > 0,
  };
}

export async function checklistOf(
  tx: Tx | Database,
  revision: { id: string; plainText: string; richText: unknown }
): Promise<Checklist> {
  const [tracks, [annotations], [questions]] = await Promise.all([
    tx
      .select({ status: schema.audioTracks.status, textHash: schema.audioTracks.textHash })
      .from(schema.audioTracks)
      .where(eq(schema.audioTracks.revisionId, revision.id)),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.lexicalAnnotations)
      .where(eq(schema.lexicalAnnotations.revisionId, revision.id)),
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.questions)
      .innerJoin(schema.exerciseSets, eq(schema.questions.exerciseSetId, schema.exerciseSets.id))
      .where(and(eq(schema.exerciseSets.revisionId, revision.id))),
  ]);
  return checklistFrom({
    plainText: revision.plainText,
    richText: revision.richText,
    tracks,
    linkedSenses: annotations?.n ?? 0,
    questions: questions?.n ?? 0,
  });
}

export const missingParts = (checklist: Checklist, required: readonly LessonPart[]) =>
  required.filter((part) => !checklist[part]);

/** Refuses to move a reading lesson on (review, publish) while a required part is unfinished. */
export async function assertComplete(
  tx: Tx,
  resourceId: string,
  revision: { id: string; plainText: string; richText: unknown },
  required: readonly LessonPart[]
) {
  if (!required.length) return;
  const [resource] = await tx
    .select({ kind: schema.resources.kind })
    .from(schema.resources)
    .where(eq(schema.resources.id, resourceId));
  if (resource?.kind !== "READING") return;
  const missing = missingParts(await checklistOf(tx, revision), required);
  if (missing.length) {
    throw conflict(`Finish the lesson first: it still needs ${missing.map((p) => LABEL[p]).join(", ")}`);
  }
}
