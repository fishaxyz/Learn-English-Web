import { z } from "zod";

/**
 * Question payloads, schema version 1 (AGENTS.md §5.4). `prompt` is what learners see; `grading` is the
 * private answer key. Each type is one branch of a discriminated union; new types are added as new branches
 * with their own grader.
 */
export const QUESTION_SCHEMA_VERSION = 1;

const short = z.string().trim().min(1).max(500);
const gapId = z.string().regex(/^[a-z0-9-]{1,32}$/, "gap ids are 1-32 lowercase letters, digits or -");

export const singleChoice = {
  prompt: z.strictObject({ stem: short }),
  grading: z.strictObject({ type: z.literal("SINGLE_CHOICE"), correctOption: z.number().int().min(0) }),
};

export const trueFalseNotGiven = {
  prompt: z.strictObject({ statement: short }),
  grading: z.strictObject({ type: z.literal("TRUE_FALSE_NOT_GIVEN"), answer: z.enum(["TRUE", "FALSE", "NOT_GIVEN"]) }),
};

const segment = z.union([z.strictObject({ text: z.string().min(1).max(1000) }), z.strictObject({ gapId })]);

export const gapFill = {
  prompt: z.strictObject({ segments: z.array(segment).min(1).max(50) }),
  grading: z.strictObject({
    type: z.literal("GAP_FILL"),
    gaps: z
      .array(
        z.strictObject({
          gapId,
          /** Every accepted answer, spelled out. Nothing else is accepted: no guessing at synonyms. */
          accepted: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
          caseSensitive: z.boolean().default(false),
        })
      )
      .min(1),
  }),
};

export const grading = z.discriminatedUnion("type", [singleChoice.grading, trueFalseNotGiven.grading, gapFill.grading]);
export type Grading = z.infer<typeof grading>;

/** A question as an editor (or the seed) writes it. */
export const questionInput = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("SINGLE_CHOICE"),
    points: z.number().int().min(1).max(10).default(1),
    prompt: singleChoice.prompt,
    options: z.array(short).min(2).max(8),
    grading: singleChoice.grading,
    explanation: z.string().max(2000).optional(),
  }),
  z.strictObject({
    type: z.literal("TRUE_FALSE_NOT_GIVEN"),
    points: z.number().int().min(1).max(10).default(1),
    prompt: trueFalseNotGiven.prompt,
    grading: trueFalseNotGiven.grading,
    explanation: z.string().max(2000).optional(),
  }),
  z.strictObject({
    type: z.literal("GAP_FILL"),
    points: z.number().int().min(1).max(10).default(1),
    prompt: gapFill.prompt,
    grading: gapFill.grading,
    explanation: z.string().max(2000).optional(),
  }),
]);
export type QuestionInput = z.input<typeof questionInput>;

export const exerciseSetInput = z.strictObject({
  title: short,
  instructions: z.string().max(2000).optional(),
  questions: z.array(questionInput).min(1).max(100),
});
export type ExerciseSetInput = z.input<typeof exerciseSetInput>;

/** Checks that a question's parts agree with each other (gap ids match, the correct option exists). */
export function checkConsistency(q: z.output<typeof questionInput>): string | null {
  if (q.type === "SINGLE_CHOICE" && q.grading.correctOption >= q.options.length) {
    return "the correct option doesn't exist";
  }
  if (q.type === "GAP_FILL") {
    const inPrompt = q.prompt.segments.flatMap((s) => ("gapId" in s ? [s.gapId] : []));
    const inKey = q.grading.gaps.map((g) => g.gapId);
    if (new Set(inPrompt).size !== inPrompt.length) return "a gap id is used twice";
    if (inPrompt.length === 0) return "a gap-fill question needs at least one gap";
    if ([...inPrompt].sort().join() !== [...inKey].sort().join()) return "every gap needs exactly one answer key";
  }
  return null;
}
