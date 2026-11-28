import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuestionFile } from "../lib/question-file";
import { parseScriptFile, scriptDocument } from "../lib/script-file";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("a script file", () => {
  it("reads the title, the summary and the paragraphs, without IELTS letters or bold marks", () => {
    const read = parseScriptFile(fixture("vanishing-dark-reading.txt"));
    expect(read.title).toBe("The Vanishing Dark");
    expect(read.summary).toBe("How artificial light at night is reshaping the natural world");
    expect(read.paragraphs).toHaveLength(7);
    expect(read.paragraphs[0]).toMatch(/^For most of the Earth's history/);
    expect(read.paragraphs[0]).toContain("many species came to rely on darkness");
    expect(read.paragraphs.join(" ")).not.toMatch(/\*\*/);
    expect(read.paragraphs[6]).toMatch(/^Public attitudes/);
  });

  it("keeps plain paragraphs as they are, and a single line is a paragraph, not a title", () => {
    expect(parseScriptFile("A dog barked.\nB. The end came.\n")).toEqual({
      title: null,
      summary: null,
      paragraphs: ["A dog barked.", "The end came."],
    });
    expect(parseScriptFile("Just one line").paragraphs).toEqual(["Just one line"]);
    const doc = scriptDocument(["One.", "Two."]);
    expect(doc.content?.map((p) => [p.type, p.content?.[0]?.text])).toEqual([
      ["paragraph", "One."],
      ["paragraph", "Two."],
    ]);
    expect(new Set(doc.content?.map((p) => p.attrs?.["id"])).size).toBe(2);
  });
});

describe("a questions file", () => {
  const { sets, problems } = parseQuestionFile(fixture("vanishing-dark-questions.txt"));

  it("reads each group as a set of its IELTS type, with answers from the key", () => {
    expect(problems).toEqual([]);
    expect(sets.map((s) => [s.title, s.questions.map((q) => q.type)])).toEqual([
      ["Questions 1–4", ["MATCHING"]],
      ["Questions 5–9", Array(5).fill("TRUE_FALSE_NOT_GIVEN")],
      ["Questions 10–13: Reducing light pollution", ["COMPLETION"]],
    ]);
    const matching = sets[0]!.questions[0]!;
    expect(matching).toMatchObject({
      variant: "INFORMATION",
      options: ["A", "B", "C", "D", "E", "F", "G"],
      answers: [5, 3, 0, 6], // F, D, A, G
      reuse: true,
    });
    expect(sets[0]!.instructions).toContain("Which paragraph contains the following information?");
    expect(sets[1]!.questions.map((q) => (q.type === "TRUE_FALSE_NOT_GIVEN" ? q.answer : null))).toEqual([
      "FALSE",
      "TRUE",
      "NOT_GIVEN",
      "NOT_GIVEN",
      "TRUE",
    ]);
    expect(sets[1]!.instructions).toBe(
      "Do the following statements agree with the information given in the Reading Passage?"
    );
  });

  it("turns a summary's gaps into answers, with other accepted spellings, and keeps the explanations", () => {
    const completion = sets[2]!.questions[0]!;
    expect(completion).toMatchObject({ variant: "SUMMARY", wordLimit: 2 });
    const text = completion.type === "COMPLETION" ? completion.text : "";
    expect(text).toContain("light is directed [downwards|downward] instead");
    expect(text).toContain("Changing the [colour|color] of light");
    expect(text).toContain("cheap to [run], they");
    expect(text).toMatch(/increase their \[safety\]\.$/);
    expect(sets[1]!.questions[1]!.explanation).toBe(
      "Paragraph B\nroughly one in three of them died before dawn ↔ most insects … survived until morning\n→ 1/3 chết nghĩa là khoảng 2/3 – tức phần lớn – sống sót đến sáng."
    );
    expect(completion.explanation).toMatch(/^10\. Paragraph F\n/);
  });

  it("reads multiple choice and short answers, and says what it couldn't read", () => {
    const read = parseQuestionFile(
      [
        "Questions 1–2",
        "Choose the correct letter, A, B, C or D.",
        "1  What did Marsh count?",
        "A birds",
        "B insects",
        "C trees",
        "2  Why are LEDs left on?",
        "A they are cheap to run",
        "B they are bright",
        "Questions 3",
        "Answer the question below. Choose NO MORE THAN THREE WORDS from the passage.",
        "3  What hormone controls sleep?",
        "Questions 4–5",
        "Label the diagram below.",
        "ANSWER KEY",
        "1. B",
        "2. A",
      ].join("\n")
    );
    expect(read.sets.map((s) => s.questions.map((q) => q.type))).toEqual([
      ["SINGLE_CHOICE", "SINGLE_CHOICE"],
      ["SHORT_ANSWER"],
    ]);
    expect(read.sets[0]!.questions[0]).toMatchObject({ options: ["birds", "insects", "trees"], correct: 1 });
    expect(read.problems).toEqual([
      "Question 3 has no answer in the answer key.",
      "Questions 4–5: the question type couldn't be told from the instructions; add them by hand.",
    ]);
  });
});
