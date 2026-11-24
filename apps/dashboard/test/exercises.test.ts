import { describe, expect, it } from "vitest";
import { fromPayload, parseGapText, toPayload } from "../lib/exercises";

describe("gap-fill text", () => {
  it("turns brackets into gaps with every accepted answer", () => {
    expect(parseGapText("It takes [forty|40] minutes.")).toEqual({
      segments: [{ text: "It takes " }, { gapId: "gap-1" }, { text: " minutes." }],
      gaps: [{ gapId: "gap-1", accepted: ["forty", "40"] }],
    });
  });

  it("explains what's wrong in the editor's terms", () => {
    expect(parseGapText("No gaps here.")).toMatch(/at least one gap/);
    expect(parseGapText("Empty [] gap.")).toMatch(/empty/);
  });
});

describe("payload round trip", () => {
  it("gives back what the API stores", () => {
    const payload = [
      {
        title: "Check",
        instructions: "Read first.",
        questions: [
          {
            type: "TRUE_FALSE_NOT_GIVEN",
            points: 1,
            prompt: { statement: "It rains." },
            grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "NOT_GIVEN" },
            explanation: "Not said.",
          },
          {
            type: "SINGLE_CHOICE",
            points: 2,
            prompt: { stem: "Pick" },
            options: ["a", "b"],
            grading: { type: "SINGLE_CHOICE", correctOption: 1 },
          },
          {
            type: "GAP_FILL",
            points: 1,
            prompt: { segments: [{ text: "About " }, { gapId: "gap-1" }, { text: " minutes." }] },
            grading: { type: "GAP_FILL", gaps: [{ gapId: "gap-1", accepted: ["forty", "40"], caseSensitive: false }] },
          },
        ],
      },
    ];
    expect(toPayload(fromPayload(payload))).toEqual(payload);
    expect(fromPayload(payload)[0]!.questions[2]).toMatchObject({ text: "About [forty|40] minutes." });
  });
});
