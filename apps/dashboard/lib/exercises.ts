import type { ExerciseSetViewFragment } from "@english/graphql";

/**
 * Exercises as the dashboard edits them, and conversions to and from the API's ExercisePayload (see
 * apps/api/src/modules/assessment/schemas.ts). The API validates everything again; these helpers only make
 * the editor convenient.
 */

export type Judgement = "TRUE" | "FALSE" | "NOT_GIVEN";

export type EditorQuestion =
  | { type: "SINGLE_CHOICE"; points: number; stem: string; options: string[]; correct: number; explanation: string }
  | { type: "TRUE_FALSE_NOT_GIVEN"; points: number; statement: string; answer: Judgement; explanation: string }
  /** `text` marks each gap with its accepted answers: "It takes [forty|40] minutes." */
  | { type: "GAP_FILL"; points: number; text: string; explanation: string };

export type EditorSet = { title: string; instructions: string; questions: EditorQuestion[] };

type Segment = { text: string } | { gapId: string };
type PayloadQuestion = {
  type: string;
  points?: number;
  prompt: Record<string, unknown>;
  options?: string[];
  grading: Record<string, unknown>;
  explanation?: string;
};
type PayloadSet = { title: string; instructions?: string; questions: PayloadQuestion[] };

const GAP = /\[([^\]]*)\]/g;

/** "It takes [forty|40] minutes." → segments and accepted answers. Errors say what's wrong in editor terms. */
export function parseGapText(
  text: string
): { segments: Segment[]; gaps: { gapId: string; accepted: string[] }[] } | string {
  const segments: Segment[] = [];
  const gaps: { gapId: string; accepted: string[] }[] = [];
  let last = 0;
  for (const match of text.matchAll(GAP)) {
    const accepted = (match[1] ?? "")
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean);
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

export function gapText(segments: Segment[], gaps: { gapId: string; accepted: string[] }[]): string {
  const answers = new Map(gaps.map((g) => [g.gapId, g.accepted]));
  return segments.map((s) => ("gapId" in s ? `[${(answers.get(s.gapId) ?? []).join("|")}]` : s.text)).join("");
}

export function fromPayload(payload: unknown): EditorSet[] {
  if (!Array.isArray(payload)) return [];
  return (payload as PayloadSet[]).map((set) => ({
    title: set.title,
    instructions: set.instructions ?? "",
    questions: set.questions.map((q): EditorQuestion => {
      const points = q.points ?? 1;
      const explanation = q.explanation ?? "";
      if (q.type === "SINGLE_CHOICE") {
        return {
          type: "SINGLE_CHOICE",
          points,
          explanation,
          stem: String(q.prompt["stem"] ?? ""),
          options: q.options ?? [],
          correct: Number(q.grading["correctOption"] ?? 0),
        };
      }
      if (q.type === "TRUE_FALSE_NOT_GIVEN") {
        return {
          type: "TRUE_FALSE_NOT_GIVEN",
          points,
          explanation,
          statement: String(q.prompt["statement"] ?? ""),
          answer: (q.grading["answer"] as Judgement) ?? "TRUE",
        };
      }
      return {
        type: "GAP_FILL",
        points,
        explanation,
        text: gapText(
          (q.prompt["segments"] as Segment[]) ?? [],
          (q.grading["gaps"] as { gapId: string; accepted: string[] }[]) ?? []
        ),
      };
    }),
  }));
}

/** To the API's shape. Returns a message instead when a gap-fill question can't be read. */
export function toPayload(sets: EditorSet[]): PayloadSet[] | string {
  const out: PayloadSet[] = [];
  for (const [s, set] of sets.entries()) {
    const questions: PayloadQuestion[] = [];
    for (const [i, q] of set.questions.entries()) {
      const base = { points: q.points, ...(q.explanation.trim() ? { explanation: q.explanation.trim() } : {}) };
      if (q.type === "SINGLE_CHOICE") {
        questions.push({
          ...base,
          type: q.type,
          prompt: { stem: q.stem },
          options: q.options,
          grading: { type: q.type, correctOption: q.correct },
        });
      } else if (q.type === "TRUE_FALSE_NOT_GIVEN") {
        questions.push({
          ...base,
          type: q.type,
          prompt: { statement: q.statement },
          grading: { type: q.type, answer: q.answer },
        });
      } else {
        const parsed = parseGapText(q.text);
        if (typeof parsed === "string") return `Set ${s + 1}, question ${i + 1}: ${parsed}`;
        questions.push({
          ...base,
          type: q.type,
          prompt: { segments: parsed.segments },
          grading: { type: q.type, gaps: parsed.gaps.map((g) => ({ ...g, caseSensitive: false })) },
        });
      }
    }
    out.push({
      title: set.title,
      ...(set.instructions.trim() ? { instructions: set.instructions.trim() } : {}),
      questions,
    });
  }
  return out;
}

/** What learners will see, for the preview (placeholder ids; answers stay out, as on the site). */
export function previewSets(payload: unknown): ExerciseSetViewFragment[] {
  return fromPayload(payload).map((set, s) => ({
    id: `preview-${s}`,
    title: set.title,
    instructions: set.instructions || null,
    questions: set.questions.map((q, i) => {
      const id = `preview-${s}-${i}`;
      const common = { id, position: i, points: q.points };
      if (q.type === "SINGLE_CHOICE") {
        return {
          __typename: "SingleChoiceQuestion" as const,
          ...common,
          stem: q.stem,
          options: q.options.map((content, o) => ({ id: `${id}-${o}`, content })),
        };
      }
      if (q.type === "TRUE_FALSE_NOT_GIVEN")
        return { __typename: "TrueFalseNotGivenQuestion" as const, ...common, statement: q.statement };
      const parsed = parseGapText(q.text);
      const segments = typeof parsed === "string" ? [{ text: q.text }] : parsed.segments;
      return {
        __typename: "GapFillQuestion" as const,
        ...common,
        segments: segments.map((seg) =>
          "gapId" in seg
            ? { __typename: "GapSegment" as const, gapId: seg.gapId }
            : { __typename: "TextSegment" as const, text: seg.text }
        ),
      };
    }),
  }));
}

export const blankQuestion = (type: EditorQuestion["type"]): EditorQuestion =>
  type === "SINGLE_CHOICE"
    ? { type, points: 1, stem: "", options: ["", ""], correct: 0, explanation: "" }
    : type === "TRUE_FALSE_NOT_GIVEN"
      ? { type, points: 1, statement: "", answer: "TRUE", explanation: "" }
      : { type, points: 1, text: "", explanation: "" };
