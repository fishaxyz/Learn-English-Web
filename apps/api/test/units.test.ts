import { describe, expect, it } from "vitest";
import { grade, normalizeAnswer } from "../src/modules/assessment/grading";
import { checkConsistency, questionInput } from "../src/modules/assessment/schemas";
import { decodeCursor, encodeCursor } from "../src/modules/resources/cursor";
import { normalizeHeadword } from "../src/modules/lexicon/service";
import { parseRichText, plainTextOf, wordCount } from "../src/modules/rich-text";

describe("answer normalization", () => {
  it("ignores case, spacing and curly apostrophes, and nothing else", () => {
    expect(normalizeAnswer("  Don’t   STOP ", false)).toBe("don't stop");
    expect(normalizeAnswer("Café", false)).toBe(normalizeAnswer("Café", false)); // NFC: é either way
    expect(normalizeAnswer("London", true)).not.toBe(normalizeAnswer("london", true));
  });

  it("scores gap fills all-or-nothing", () => {
    const key = {
      type: "GAP_FILL" as const,
      gaps: [
        { gapId: "a", accepted: ["went"], caseSensitive: false },
        { gapId: "b", accepted: ["by train", "on the train"], caseSensitive: false },
      ],
    };
    expect(
      grade(
        key,
        {
          gaps: [
            { gapId: "a", text: "Went" },
            { gapId: "b", text: "on the train" },
          ],
        },
        2
      ).awardedPoints
    ).toBe(2);
    expect(grade(key, { gaps: [{ gapId: "a", text: "went" }] }, 2).awardedPoints).toBe(0);
  });
});

describe("question validation", () => {
  it("catches answer keys that don't match their prompt", () => {
    const q = questionInput.parse({
      type: "GAP_FILL",
      prompt: { segments: [{ text: "I " }, { gapId: "verb" }] },
      grading: { type: "GAP_FILL", gaps: [{ gapId: "other", accepted: ["x"] }] },
    });
    expect(checkConsistency(q)).toMatch(/every gap/);
    const choice = questionInput.parse({
      type: "SINGLE_CHOICE",
      prompt: { stem: "?" },
      options: ["a", "b"],
      grading: { type: "SINGLE_CHOICE", correctOption: 2 },
    });
    expect(checkConsistency(choice)).toMatch(/doesn't exist/);
  });
});

describe("rich text", () => {
  const doc = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", attrs: { id: "para-1" }, content: [{ type: "text", text }] }],
  });

  it("keeps accented letters and emoji intact in the plain text and counts words in any script", () => {
    const text = "Zoë’s café 🚆 opens at 7 — naïve, well-known, don't";
    expect(plainTextOf(parseRichText(doc(text)))).toBe(text);
    expect(wordCount(text)).toBe(8); // Zoë’s, café, opens, at, 7, naïve, well-known, don't
  });

  it("rejects duplicate block ids", () => {
    const twice = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "same" }, content: [] },
        { type: "paragraph", attrs: { id: "same" }, content: [] },
      ],
    };
    expect(() => parseRichText(twice)).toThrow(/used twice/);
  });
});

describe("cursors and headwords", () => {
  it("round-trips cursors and rejects forged ones", () => {
    const c = { publishedAt: new Date("2026-01-02T03:04:05.000Z"), id: "00000000-0000-4000-8000-000000000001" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(() => decodeCursor("not-a-cursor")).toThrow(/Invalid cursor/);
  });

  it("normalizes headwords for search only", () => {
    expect(normalizeHeadword("  Rush   Hour ")).toBe("rush hour");
    expect(normalizeHeadword("O’Clock")).toBe("o'clock");
  });
});
