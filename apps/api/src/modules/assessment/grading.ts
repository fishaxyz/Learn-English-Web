import { wordsIn, type Grading } from "./schemas";

/** Bumped whenever grading rules change, so a stored score always says which rules produced it. */
export const GRADING_VERSION = 2;

/**
 * Deterministic normalization for typed answers: Unicode NFC, curly quotes and apostrophes made straight,
 * spaces trimmed and collapsed, case folded unless the key is case-sensitive. Nothing fuzzier: a near-miss
 * is wrong, and accepted variants are listed in the key (AGENTS.md §5.4).
 */
export function normalizeAnswer(text: string, caseSensitive: boolean): string {
  const t = text.normalize("NFC").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  return caseSensitive ? t : t.toLocaleLowerCase("en");
}

export type Judgement = "TRUE" | "FALSE" | "NOT_GIVEN" | "YES" | "NO";

export type LearnerResponse = {
  /** Index of the chosen option, for single choice. */
  optionIndex?: number;
  /** Indexes of the chosen options, for multiple choice. */
  optionIndexes?: number[];
  judgement?: Judgement;
  /** For matching: each item and the index of the option chosen for it. */
  matches?: { itemId: string; optionIndex: number }[];
  gaps?: { gapId: string; text: string }[];
  /** For short answer. */
  text?: string;
};

export type Correct =
  | { kind: "choice"; optionIndex: number }
  | { kind: "choices"; optionIndexes: number[] }
  | { kind: "judgement"; judgement: Judgement }
  | { kind: "matches"; matches: { itemId: string; optionIndex: number }[] }
  | { kind: "gaps"; gaps: { gapId: string; text: string }[] }
  | { kind: "text"; text: string };

const matchesKey = (given: string | undefined, accepted: string[], caseSensitive: boolean, limit?: number) => {
  if (given === undefined || !given.trim()) return false;
  // Over the word limit is wrong even if the right words are in it (IELTS).
  if (limit !== undefined && wordsIn(given) > limit) return false;
  const answer = normalizeAnswer(given, caseSensitive);
  return accepted.some((a) => normalizeAnswer(a, caseSensitive) === answer);
};

/**
 * Grades one answer. Multi-mark types score one mark per correct part (letter, matched item, gap), as in IELTS;
 * the older gap fill stays all-or-nothing. `points` is the question's stored marks.
 */
export function grade(key: Grading, response: LearnerResponse, points: number, wordLimit?: number) {
  let marks = 0;
  let answer: Correct;
  switch (key.type) {
    case "SINGLE_CHOICE":
      marks = response.optionIndex === key.correctOption ? points : 0;
      answer = { kind: "choice", optionIndex: key.correctOption };
      break;
    case "MULTIPLE_CHOICE": {
      const chosen = [...new Set(response.optionIndexes ?? [])];
      // Choosing more letters than asked scores nothing (no guessing by ticking everything).
      marks =
        chosen.length > key.correctOptions.length ? 0 : chosen.filter((i) => key.correctOptions.includes(i)).length;
      answer = { kind: "choices", optionIndexes: key.correctOptions };
      break;
    }
    case "TRUE_FALSE_NOT_GIVEN":
    case "YES_NO_NOT_GIVEN":
      marks = response.judgement === key.answer ? points : 0;
      answer = { kind: "judgement", judgement: key.answer };
      break;
    case "MATCHING": {
      const given = new Map((response.matches ?? []).map((m) => [m.itemId, m.optionIndex]));
      marks = key.matches.filter((m) => given.get(m.itemId) === m.option).length;
      answer = { kind: "matches", matches: key.matches.map((m) => ({ itemId: m.itemId, optionIndex: m.option })) };
      break;
    }
    case "GAP_FILL":
    case "COMPLETION": {
      const given = new Map((response.gaps ?? []).map((g) => [g.gapId, g.text]));
      const right = key.gaps.filter((gap) =>
        matchesKey(given.get(gap.gapId), gap.accepted, gap.caseSensitive, wordLimit)
      );
      marks = key.type === "GAP_FILL" ? (right.length === key.gaps.length ? points : 0) : right.length;
      answer = { kind: "gaps", gaps: key.gaps.map((g) => ({ gapId: g.gapId, text: g.accepted[0] ?? "" })) };
      break;
    }
    case "SHORT_ANSWER":
      marks = matchesKey(response.text, key.accepted, false, wordLimit) ? points : 0;
      answer = { kind: "text", text: key.accepted[0] ?? "" };
      break;
  }
  return { correct: marks === points, awardedPoints: marks, maxPoints: points, answer };
}
