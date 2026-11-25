import { z } from "zod";

/**
 * Question payloads, schema version 1 (AGENTS.md §5.4). `prompt` is what learners see; `grading` is the
 * private answer key. Each type is one branch of a discriminated union, with its own grader. The types follow the
 * IELTS Reading formats (ADR 0008): single and multiple choice, True/False/Not Given and Yes/No/Not Given,
 * matching (headings, information, features, sentence endings), completion and short answer, plus the older
 * free gap fill.
 */
export const QUESTION_SCHEMA_VERSION = 1;

const short = z.string().trim().min(1).max(500);
const gapId = z.string().regex(/^[a-z0-9-]{1,32}$/, "gap ids are 1-32 lowercase letters, digits or -");
const itemId = z.string().regex(/^[a-z0-9-]{1,32}$/, "item ids are 1-32 lowercase letters, digits or -");
/** "NO MORE THAN TWO WORDS": answers longer than this are wrong, as in IELTS. */
const wordLimit = z.number().int().min(1).max(5);
const accepted = z.array(z.string().trim().min(1).max(100)).min(1).max(20);

export const singleChoice = {
  prompt: z.strictObject({ stem: short }),
  grading: z.strictObject({ type: z.literal("SINGLE_CHOICE"), correctOption: z.number().int().min(0) }),
};

export const multipleChoice = {
  /** "Choose TWO letters": `choose` options are correct, one mark each. */
  prompt: z.strictObject({ stem: short, choose: z.number().int().min(2).max(5) }),
  grading: z.strictObject({
    type: z.literal("MULTIPLE_CHOICE"),
    correctOptions: z.array(z.number().int().min(0)).min(2).max(5),
  }),
};

export const trueFalseNotGiven = {
  prompt: z.strictObject({ statement: short }),
  grading: z.strictObject({ type: z.literal("TRUE_FALSE_NOT_GIVEN"), answer: z.enum(["TRUE", "FALSE", "NOT_GIVEN"]) }),
};

export const yesNoNotGiven = {
  /** The writer's views or claims (IELTS: "Do the following statements agree with the views of the writer?"). */
  prompt: z.strictObject({ statement: short }),
  grading: z.strictObject({ type: z.literal("YES_NO_NOT_GIVEN"), answer: z.enum(["YES", "NO", "NOT_GIVEN"]) }),
};

export const MATCHING_VARIANTS = ["HEADINGS", "INFORMATION", "FEATURES", "SENTENCE_ENDINGS"] as const;
export const matching = {
  /**
   * Items (paragraphs, statements or sentence beginnings) each matched to one option (headings, paragraph
   * letters, people or features, sentence endings). One mark per item. `reuse`: an option may be used more than
   * once ("You may use any letter more than once").
   */
  prompt: z.strictObject({
    variant: z.enum(MATCHING_VARIANTS),
    items: z
      .array(z.strictObject({ itemId, text: short }))
      .min(1)
      .max(20),
    reuse: z.boolean().default(false),
  }),
  grading: z.strictObject({
    type: z.literal("MATCHING"),
    matches: z
      .array(z.strictObject({ itemId, option: z.number().int().min(0) }))
      .min(1)
      .max(20),
  }),
};

const segment = z.union([z.strictObject({ text: z.string().min(1).max(1000) }), z.strictObject({ gapId })]);
const gapKey = z.strictObject({ gapId, accepted, caseSensitive: z.boolean().default(false) });

export const gapFill = {
  prompt: z.strictObject({ segments: z.array(segment).min(1).max(50) }),
  grading: z.strictObject({
    type: z.literal("GAP_FILL"),
    /** Every accepted answer, spelled out. Nothing else is accepted: no guessing at synonyms. */
    gaps: z.array(gapKey).min(1),
  }),
};

export const COMPLETION_VARIANTS = ["SENTENCE", "SUMMARY", "NOTE"] as const;
export const completion = {
  /**
   * Sentence, summary or note completion: gaps in a text, each one mark, answers within the word limit. With a
   * `wordBox`, learners choose each answer from the box instead of typing it.
   */
  prompt: z.strictObject({
    variant: z.enum(COMPLETION_VARIANTS),
    segments: z.array(segment).min(1).max(50),
    wordLimit,
    wordBox: z.array(z.string().trim().min(1).max(100)).min(2).max(20).optional(),
  }),
  grading: z.strictObject({ type: z.literal("COMPLETION"), gaps: z.array(gapKey).min(1) }),
};

export const shortAnswer = {
  prompt: z.strictObject({ question: short, wordLimit }),
  grading: z.strictObject({ type: z.literal("SHORT_ANSWER"), accepted }),
};

export const grading = z.discriminatedUnion("type", [
  singleChoice.grading,
  multipleChoice.grading,
  trueFalseNotGiven.grading,
  yesNoNotGiven.grading,
  matching.grading,
  gapFill.grading,
  completion.grading,
  shortAnswer.grading,
]);
export type Grading = z.infer<typeof grading>;

const base = {
  points: z.number().int().min(1).max(20).default(1),
  explanation: z.string().max(2000).optional(),
};

/** A question as an editor (or the seed, or an approved AI suggestion) writes it. */
export const questionInput = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("SINGLE_CHOICE"),
    ...base,
    prompt: singleChoice.prompt,
    options: z.array(short).min(2).max(8),
    grading: singleChoice.grading,
  }),
  z.strictObject({
    type: z.literal("MULTIPLE_CHOICE"),
    ...base,
    prompt: multipleChoice.prompt,
    options: z.array(short).min(3).max(10),
    grading: multipleChoice.grading,
  }),
  z.strictObject({
    type: z.literal("TRUE_FALSE_NOT_GIVEN"),
    ...base,
    prompt: trueFalseNotGiven.prompt,
    grading: trueFalseNotGiven.grading,
  }),
  z.strictObject({
    type: z.literal("YES_NO_NOT_GIVEN"),
    ...base,
    prompt: yesNoNotGiven.prompt,
    grading: yesNoNotGiven.grading,
  }),
  z.strictObject({
    type: z.literal("MATCHING"),
    ...base,
    prompt: matching.prompt,
    options: z.array(short).min(2).max(20),
    grading: matching.grading,
  }),
  z.strictObject({ type: z.literal("GAP_FILL"), ...base, prompt: gapFill.prompt, grading: gapFill.grading }),
  z.strictObject({ type: z.literal("COMPLETION"), ...base, prompt: completion.prompt, grading: completion.grading }),
  z.strictObject({
    type: z.literal("SHORT_ANSWER"),
    ...base,
    prompt: shortAnswer.prompt,
    grading: shortAnswer.grading,
  }),
]);
export type QuestionInput = z.input<typeof questionInput>;
export type Question = z.output<typeof questionInput>;
export const QUESTION_TYPES = questionInput.options.map((o) => o.shape.type.value);

/** Types with options stored as rows (learners pick them by id). */
export const hasOptions = (type: string) => ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "MATCHING"].includes(type);

export const exerciseSetInput = z.strictObject({
  title: short,
  instructions: z.string().max(2000).optional(),
  questions: z.array(questionInput).min(1).max(100),
});
export type ExerciseSetInput = z.input<typeof exerciseSetInput>;

/** Words in an answer, as IELTS counts them: a hyphenated word or a number is one word. */
export const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** How many marks a question is worth: one per correct letter, matched item or gap; otherwise its points. */
export function marksOf(q: Question): number {
  if (q.type === "MULTIPLE_CHOICE") return q.prompt.choose;
  if (q.type === "MATCHING") return q.prompt.items.length;
  if (q.type === "COMPLETION") return q.grading.gaps.length;
  return q.points;
}

function gapsAgree(segments: z.infer<typeof segment>[], gaps: { gapId: string }[]): string | null {
  const inPrompt = segments.flatMap((s) => ("gapId" in s ? [s.gapId] : []));
  const inKey = gaps.map((g) => g.gapId);
  if (new Set(inPrompt).size !== inPrompt.length) return "a gap id is used twice";
  if (inPrompt.length === 0) return "it needs at least one gap";
  if ([...inPrompt].sort().join() !== [...inKey].sort().join()) return "every gap needs exactly one answer key";
  return null;
}

/** Checks that a question's parts agree with each other (gap ids match, the correct options exist...). */
export function checkConsistency(q: Question): string | null {
  switch (q.type) {
    case "SINGLE_CHOICE":
      return q.grading.correctOption >= q.options.length ? "the correct option doesn't exist" : null;
    case "MULTIPLE_CHOICE": {
      const right = q.grading.correctOptions;
      if (new Set(right).size !== right.length) return "a correct option is listed twice";
      if (right.some((i) => i >= q.options.length)) return "a correct option doesn't exist";
      if (right.length !== q.prompt.choose)
        return `it says choose ${q.prompt.choose}, so exactly that many must be correct`;
      return null;
    }
    case "MATCHING": {
      const items = q.prompt.items.map((i) => i.itemId);
      if (new Set(items).size !== items.length) return "an item id is used twice";
      const keyed = q.grading.matches.map((m) => m.itemId);
      if ([...items].sort().join() !== [...keyed].sort().join()) return "every item needs exactly one answer";
      if (q.grading.matches.some((m) => m.option >= q.options.length)) return "an answer option doesn't exist";
      const used = q.grading.matches.map((m) => m.option);
      if (!q.prompt.reuse && new Set(used).size !== used.length) {
        return "an option is the answer twice: allow options to be used more than once, or change an answer";
      }
      return null;
    }
    case "GAP_FILL":
      return gapsAgree(q.prompt.segments, q.grading.gaps);
    case "COMPLETION": {
      const problem = gapsAgree(q.prompt.segments, q.grading.gaps);
      if (problem) return problem;
      const answers = q.grading.gaps.flatMap((g) => g.accepted);
      if (answers.some((a) => wordsIn(a) > q.prompt.wordLimit)) {
        return `an answer is longer than the word limit (${q.prompt.wordLimit})`;
      }
      const box = q.prompt.wordBox?.map((w) => w.toLocaleLowerCase("en"));
      if (box && answers.some((a) => !box.includes(a.toLocaleLowerCase("en")))) {
        return "with a word box, every answer must be one of its words";
      }
      return null;
    }
    case "SHORT_ANSWER":
      return q.grading.accepted.some((a) => wordsIn(a) > q.prompt.wordLimit)
        ? `an answer is longer than the word limit (${q.prompt.wordLimit})`
        : null;
    default:
      return null;
  }
}
