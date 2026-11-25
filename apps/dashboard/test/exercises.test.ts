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

describe("IELTS question types in the editor", () => {
  const payload = [
    {
      title: "Mixed",
      questions: [
        {
          type: "MULTIPLE_CHOICE",
          points: 1,
          prompt: { stem: "Which TWO?", choose: 2 },
          options: ["a", "b", "c", "d", "e"],
          grading: { type: "MULTIPLE_CHOICE", correctOptions: [1, 3] },
        },
        {
          type: "YES_NO_NOT_GIVEN",
          points: 1,
          prompt: { statement: "Cycling is best." },
          grading: { type: "YES_NO_NOT_GIVEN", answer: "YES" },
        },
        {
          type: "MATCHING",
          points: 1,
          prompt: {
            variant: "INFORMATION",
            items: [
              { itemId: "i1", text: "a delay" },
              { itemId: "i2", text: "a view" },
            ],
            reuse: true,
          },
          options: ["A", "B", "C"],
          grading: {
            type: "MATCHING",
            matches: [
              { itemId: "i1", option: 1 },
              { itemId: "i2", option: 1 },
            ],
          },
        },
        {
          type: "COMPLETION",
          points: 1,
          prompt: {
            variant: "SUMMARY",
            segments: [{ text: "She takes the " }, { gapId: "gap-1" }, { text: "." }],
            wordLimit: 1,
            wordBox: ["bus", "train"],
          },
          grading: { type: "COMPLETION", gaps: [{ gapId: "gap-1", accepted: ["bus"], caseSensitive: false }] },
        },
        {
          type: "SHORT_ANSWER",
          points: 1,
          prompt: { question: "How long?", wordLimit: 3 },
          grading: { type: "SHORT_ANSWER", accepted: ["forty minutes", "40 minutes"] },
        },
      ],
    },
  ];

  it("reads every type into editor fields and writes it back unchanged", () => {
    const sets = fromPayload(payload);
    expect(sets[0]?.questions.map((q) => q.type)).toEqual([
      "MULTIPLE_CHOICE",
      "YES_NO_NOT_GIVEN",
      "MATCHING",
      "COMPLETION",
      "SHORT_ANSWER",
    ]);
    expect(sets[0]?.questions[2]).toMatchObject({ items: ["a delay", "a view"], answers: [1, 1], reuse: true });
    expect(sets[0]?.questions[3]).toMatchObject({ text: "She takes the [bus].", wordBox: "bus, train" });
    expect(sets[0]?.questions[4]).toMatchObject({ answers: "forty minutes | 40 minutes" });
    expect(toPayload(sets)).toEqual(payload);
  });

  it("says what's wrong in editor terms", () => {
    const sets = fromPayload(payload);
    const q = sets[0]!.questions[0]!;
    expect(toPayload([{ ...sets[0]!, questions: [{ ...q, correct: [1] } as typeof q] }])).toMatch(
      /at least two correct/
    );
  });
});
