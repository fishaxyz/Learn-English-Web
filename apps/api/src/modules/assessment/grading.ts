import type { Grading } from "./schemas";

/** Bumped whenever grading rules change, so a stored score always says which rules produced it. */
export const GRADING_VERSION = 1;

/**
 * Deterministic normalization for typed answers: Unicode NFC, curly quotes and apostrophes made straight,
 * spaces trimmed and collapsed, case folded unless the key is case-sensitive. Nothing fuzzier: a near-miss
 * is wrong, and accepted variants are listed in the key (AGENTS.md §5.4).
 */
export function normalizeAnswer(text: string, caseSensitive: boolean): string {
  const t = text.normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  return caseSensitive ? t : t.toLocaleLowerCase("en");
}

export type LearnerResponse = {
  /** Index of the chosen option, for single choice. */
  optionIndex?: number;
  judgement?: "TRUE" | "FALSE" | "NOT_GIVEN";
  gaps?: { gapId: string; text: string }[];
};

export type Correct =
  | { kind: "choice"; optionIndex: number }
  | { kind: "judgement"; judgement: "TRUE" | "FALSE" | "NOT_GIVEN" }
  | { kind: "gaps"; gaps: { gapId: string; text: string }[] };

/** Grades one answer. All-or-nothing per question: a gap fill scores only when every gap is right. */
export function grade(key: Grading, response: LearnerResponse, points: number) {
  let correct = false;
  let answer: Correct;
  switch (key.type) {
    case "SINGLE_CHOICE":
      correct = response.optionIndex === key.correctOption;
      answer = { kind: "choice", optionIndex: key.correctOption };
      break;
    case "TRUE_FALSE_NOT_GIVEN":
      correct = response.judgement === key.answer;
      answer = { kind: "judgement", judgement: key.answer };
      break;
    case "GAP_FILL": {
      const given = new Map((response.gaps ?? []).map((g) => [g.gapId, g.text]));
      correct = key.gaps.every((gap) => {
        const text = given.get(gap.gapId);
        if (text === undefined) return false;
        const answerText = normalizeAnswer(text, gap.caseSensitive);
        return gap.accepted.some((a) => normalizeAnswer(a, gap.caseSensitive) === answerText);
      });
      answer = { kind: "gaps", gaps: key.gaps.map((g) => ({ gapId: g.gapId, text: g.accepted[0] ?? "" })) };
      break;
    }
  }
  return { correct, awardedPoints: correct ? points : 0, maxPoints: points, answer };
}
