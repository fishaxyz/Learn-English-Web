import type { ExerciseSetViewFragment } from "@english/graphql";

/**
 * Exercises as the dashboard edits them, and conversions to and from the API's ExercisePayload (see
 * apps/api/src/modules/assessment/schemas.ts). The API validates everything again; these helpers only make
 * the editor convenient. The types follow IELTS Reading (ADR 0008).
 */

export type Judgement = "TRUE" | "FALSE" | "NOT_GIVEN";
export type View = "YES" | "NO" | "NOT_GIVEN";
export type MatchingVariant = "HEADINGS" | "INFORMATION" | "FEATURES" | "SENTENCE_ENDINGS";
export type CompletionVariant = "SENTENCE" | "SUMMARY" | "NOTE";

type Base = { points: number; explanation: string };
export type EditorQuestion =
  | (Base & { type: "SINGLE_CHOICE"; stem: string; options: string[]; correct: number })
  | (Base & { type: "MULTIPLE_CHOICE"; stem: string; options: string[]; correct: number[] })
  | (Base & { type: "TRUE_FALSE_NOT_GIVEN"; statement: string; answer: Judgement })
  | (Base & { type: "YES_NO_NOT_GIVEN"; statement: string; answer: View })
  | (Base & {
      type: "MATCHING";
      variant: MatchingVariant;
      /** Paragraphs, statements or sentence beginnings. */
      items: string[];
      /** Headings, paragraph letters, features or sentence endings. */
      options: string[];
      /** For each item, the index of its option. */
      answers: number[];
      reuse: boolean;
    })
  /** `text` marks each gap with its accepted answers: "It takes [forty|40] minutes." */
  | (Base & { type: "GAP_FILL"; text: string })
  | (Base & {
      type: "COMPLETION";
      variant: CompletionVariant;
      text: string;
      wordLimit: number;
      /** Comma-separated words to choose from; empty for typed answers. */
      wordBox: string;
    })
  /** `answers`: accepted answers separated by "|". */
  | (Base & { type: "SHORT_ANSWER"; question: string; answers: string; wordLimit: number });

export type EditorSet = { title: string; instructions: string; questions: EditorQuestion[] };

export const TYPE_LABEL: Record<EditorQuestion["type"], string> = {
  SINGLE_CHOICE: "Multiple choice (one answer)",
  MULTIPLE_CHOICE: "Multiple choice (choose more)",
  TRUE_FALSE_NOT_GIVEN: "True / False / Not Given",
  YES_NO_NOT_GIVEN: "Yes / No / Not Given",
  MATCHING: "Matching",
  GAP_FILL: "Fill in the gaps",
  COMPLETION: "Completion",
  SHORT_ANSWER: "Short answer",
};
export const MATCHING_LABEL: Record<MatchingVariant, string> = {
  HEADINGS: "Matching headings",
  INFORMATION: "Matching information",
  FEATURES: "Matching features",
  SENTENCE_ENDINGS: "Matching sentence endings",
};
export const COMPLETION_LABEL: Record<CompletionVariant, string> = {
  SENTENCE: "Sentence completion",
  SUMMARY: "Summary completion",
  NOTE: "Note completion",
};

type Segment = { text: string } | { gapId: string };
type Gap = { gapId: string; accepted: string[] };
export type PayloadQuestion = {
  type: string;
  points?: number;
  prompt: Record<string, unknown>;
  options?: string[];
  grading: Record<string, unknown>;
  explanation?: string;
};
type PayloadSet = { title: string; instructions?: string; questions: PayloadQuestion[] };

const GAP = /\[([^\]]*)\]/g;
const list = (text: string, by: string) =>
  text
    .split(by)
    .map((a) => a.trim())
    .filter(Boolean);

/** "It takes [forty|40] minutes." → segments and accepted answers. Errors say what's wrong in editor terms. */
export function parseGapText(text: string): { segments: Segment[]; gaps: Gap[] } | string {
  const segments: Segment[] = [];
  const gaps: Gap[] = [];
  let last = 0;
  for (const match of text.matchAll(GAP)) {
    const accepted = list(match[1] ?? "", "|");
    if (!accepted.length) return "A gap is empty: write the answer between the brackets, like [forty].";
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    const gapId = `gap-${gaps.length + 1}`;
    segments.push({ gapId });
    gaps.push({ gapId, accepted });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  if (!gaps.length) return "Mark at least one gap with square brackets, like [forty].";
  return { segments, gaps };
}

export function gapText(segments: Segment[], gaps: Gap[]): string {
  const answers = new Map(gaps.map((g) => [g.gapId, g.accepted]));
  return segments.map((s) => ("gapId" in s ? `[${(answers.get(s.gapId) ?? []).join("|")}]` : s.text)).join("");
}

/** One question from the API's shape (also used for AI-drafted questions). */
export function questionFromPayload(q: PayloadQuestion): EditorQuestion {
  const points = q.points ?? 1;
  const explanation = q.explanation ?? "";
  const p = q.prompt;
  const g = q.grading;
  switch (q.type) {
    case "SINGLE_CHOICE":
      return {
        type: "SINGLE_CHOICE",
        points,
        explanation,
        stem: String(p["stem"] ?? ""),
        options: q.options ?? [],
        correct: Number(g["correctOption"] ?? 0),
      };
    case "MULTIPLE_CHOICE":
      return {
        type: "MULTIPLE_CHOICE",
        points,
        explanation,
        stem: String(p["stem"] ?? ""),
        options: q.options ?? [],
        correct: (g["correctOptions"] as number[]) ?? [],
      };
    case "TRUE_FALSE_NOT_GIVEN":
      return {
        type: "TRUE_FALSE_NOT_GIVEN",
        points,
        explanation,
        statement: String(p["statement"] ?? ""),
        answer: (g["answer"] as Judgement) ?? "TRUE",
      };
    case "YES_NO_NOT_GIVEN":
      return {
        type: "YES_NO_NOT_GIVEN",
        points,
        explanation,
        statement: String(p["statement"] ?? ""),
        answer: (g["answer"] as View) ?? "YES",
      };
    case "MATCHING": {
      const items = (p["items"] as { itemId: string; text: string }[]) ?? [];
      const matches = (g["matches"] as { itemId: string; option: number }[]) ?? [];
      return {
        type: "MATCHING",
        points,
        explanation,
        variant: (p["variant"] as MatchingVariant) ?? "INFORMATION",
        items: items.map((i) => i.text),
        options: q.options ?? [],
        answers: items.map((i) => matches.find((m) => m.itemId === i.itemId)?.option ?? 0),
        reuse: Boolean(p["reuse"]),
      };
    }
    case "COMPLETION":
      return {
        type: "COMPLETION",
        points,
        explanation,
        variant: (p["variant"] as CompletionVariant) ?? "SENTENCE",
        text: gapText((p["segments"] as Segment[]) ?? [], (g["gaps"] as Gap[]) ?? []),
        wordLimit: Number(p["wordLimit"] ?? 2),
        wordBox: ((p["wordBox"] as string[] | undefined) ?? []).join(", "),
      };
    case "SHORT_ANSWER":
      return {
        type: "SHORT_ANSWER",
        points,
        explanation,
        question: String(p["question"] ?? ""),
        answers: ((g["accepted"] as string[]) ?? []).join(" | "),
        wordLimit: Number(p["wordLimit"] ?? 3),
      };
    default:
      return {
        type: "GAP_FILL",
        points,
        explanation,
        text: gapText((p["segments"] as Segment[]) ?? [], (g["gaps"] as Gap[]) ?? []),
      };
  }
}

export function fromPayload(payload: unknown): EditorSet[] {
  if (!Array.isArray(payload)) return [];
  return (payload as PayloadSet[]).map((set) => ({
    title: set.title,
    instructions: set.instructions ?? "",
    questions: set.questions.map(questionFromPayload),
  }));
}

/** One question in the API's shape, or a message saying what's wrong in editor terms. */
export function questionToPayload(q: EditorQuestion): PayloadQuestion | string {
  const base = { points: q.points, ...(q.explanation.trim() ? { explanation: q.explanation.trim() } : {}) };
  switch (q.type) {
    case "SINGLE_CHOICE":
      return {
        ...base,
        type: q.type,
        prompt: { stem: q.stem },
        options: q.options,
        grading: { type: q.type, correctOption: q.correct },
      };
    case "MULTIPLE_CHOICE":
      if (q.correct.length < 2) return "Tick at least two correct options.";
      return {
        ...base,
        type: q.type,
        prompt: { stem: q.stem, choose: q.correct.length },
        options: q.options,
        grading: { type: q.type, correctOptions: [...q.correct].sort((a, b) => a - b) },
      };
    case "TRUE_FALSE_NOT_GIVEN":
    case "YES_NO_NOT_GIVEN":
      return { ...base, type: q.type, prompt: { statement: q.statement }, grading: { type: q.type, answer: q.answer } };
    case "MATCHING": {
      const items = q.items.map((text, i) => ({ itemId: `i${i + 1}`, text }));
      return {
        ...base,
        type: q.type,
        prompt: { variant: q.variant, items, reuse: q.reuse },
        options: q.options,
        grading: { type: q.type, matches: items.map((it, i) => ({ itemId: it.itemId, option: q.answers[i] ?? 0 })) },
      };
    }
    case "COMPLETION": {
      const parsed = parseGapText(q.text);
      if (typeof parsed === "string") return parsed;
      const box = list(q.wordBox, ",");
      return {
        ...base,
        type: q.type,
        prompt: {
          variant: q.variant,
          segments: parsed.segments,
          wordLimit: q.wordLimit,
          ...(box.length ? { wordBox: box } : {}),
        },
        grading: { type: q.type, gaps: parsed.gaps.map((g) => ({ ...g, caseSensitive: false })) },
      };
    }
    case "SHORT_ANSWER": {
      const accepted = list(q.answers, "|");
      if (!accepted.length) return "Write at least one accepted answer.";
      return {
        ...base,
        type: q.type,
        prompt: { question: q.question, wordLimit: q.wordLimit },
        grading: { type: q.type, accepted },
      };
    }
    case "GAP_FILL": {
      const parsed = parseGapText(q.text);
      if (typeof parsed === "string") return parsed;
      return {
        ...base,
        type: q.type,
        prompt: { segments: parsed.segments },
        grading: { type: q.type, gaps: parsed.gaps.map((g) => ({ ...g, caseSensitive: false })) },
      };
    }
  }
}

/** To the API's shape. Returns a message instead when a question can't be read. */
export function toPayload(sets: EditorSet[]): PayloadSet[] | string {
  const out: PayloadSet[] = [];
  for (const [s, set] of sets.entries()) {
    const questions: PayloadQuestion[] = [];
    for (const [i, q] of set.questions.entries()) {
      const payload = questionToPayload(q);
      if (typeof payload === "string") return `Set ${s + 1}, question ${i + 1}: ${payload}`;
      questions.push(payload);
    }
    out.push({
      title: set.title,
      ...(set.instructions.trim() ? { instructions: set.instructions.trim() } : {}),
      questions,
    });
  }
  return out;
}

type ViewQuestion = ExerciseSetViewFragment["questions"][number];
const viewSegments = (segments: Segment[]) =>
  segments.map((seg) =>
    "gapId" in seg
      ? { __typename: "GapSegment" as const, gapId: seg.gapId }
      : { __typename: "TextSegment" as const, text: seg.text }
  );

/** One question as learners see it (placeholder ids; answers stay out, as on the site). */
export function viewQuestion(q: EditorQuestion, id: string, position: number): ViewQuestion {
  const common = { id, position, points: q.points };
  const options = (list: string[]) => list.map((content, o) => ({ id: `${id}-${o}`, content }));
  const segmentsOf = (text: string) => {
    const parsed = parseGapText(text);
    return viewSegments(typeof parsed === "string" ? [{ text }] : parsed.segments);
  };
  switch (q.type) {
    case "SINGLE_CHOICE":
      return { __typename: "SingleChoiceQuestion", ...common, stem: q.stem, options: options(q.options) };
    case "MULTIPLE_CHOICE":
      return {
        __typename: "MultipleChoiceQuestion",
        ...common,
        stem: q.stem,
        choose: Math.max(2, q.correct.length),
        options: options(q.options),
      };
    case "TRUE_FALSE_NOT_GIVEN":
      return { __typename: "TrueFalseNotGivenQuestion", ...common, statement: q.statement };
    case "YES_NO_NOT_GIVEN":
      return { __typename: "YesNoNotGivenQuestion", ...common, statement: q.statement };
    case "MATCHING":
      return {
        __typename: "MatchingQuestion",
        ...common,
        matchingVariant: q.variant,
        reuse: q.reuse,
        items: q.items.map((text, i) => ({ itemId: `i${i + 1}`, text })),
        options: options(q.options),
      };
    case "COMPLETION": {
      const box = list(q.wordBox, ",");
      return {
        __typename: "CompletionQuestion",
        ...common,
        completionVariant: q.variant,
        wordLimit: q.wordLimit,
        wordBox: box.length ? box : null,
        segments: segmentsOf(q.text),
      };
    }
    case "SHORT_ANSWER":
      return { __typename: "ShortAnswerQuestion", ...common, question: q.question, wordLimit: q.wordLimit };
    case "GAP_FILL":
      return { __typename: "GapFillQuestion", ...common, segments: segmentsOf(q.text) };
  }
}

/** What learners will see, for the preview. */
export function previewSets(payload: unknown): ExerciseSetViewFragment[] {
  return fromPayload(payload).map((set, s) => ({
    id: `preview-${s}`,
    title: set.title,
    instructions: set.instructions || null,
    questions: set.questions.map((q, i) => viewQuestion(q, `preview-${s}-${i}`, i)),
  }));
}

export const blankQuestion = (type: EditorQuestion["type"]): EditorQuestion => {
  const base = { points: 1, explanation: "" };
  switch (type) {
    case "SINGLE_CHOICE":
      return { ...base, type, stem: "", options: ["", "", "", ""], correct: 0 };
    case "MULTIPLE_CHOICE":
      return { ...base, type, stem: "", options: ["", "", "", "", ""], correct: [0, 1] };
    case "TRUE_FALSE_NOT_GIVEN":
      return { ...base, type, statement: "", answer: "TRUE" };
    case "YES_NO_NOT_GIVEN":
      return { ...base, type, statement: "", answer: "YES" };
    case "MATCHING":
      return {
        ...base,
        type,
        variant: "INFORMATION",
        items: ["", ""],
        options: ["A", "B", "C"],
        answers: [0, 1],
        reuse: true,
      };
    case "COMPLETION":
      return { ...base, type, variant: "SENTENCE", text: "", wordLimit: 2, wordBox: "" };
    case "SHORT_ANSWER":
      return { ...base, type, question: "", answers: "", wordLimit: 3 };
    case "GAP_FILL":
      return { ...base, type, text: "" };
  }
};
