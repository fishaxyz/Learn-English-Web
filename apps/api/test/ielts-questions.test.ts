import { testDatabaseUrl } from "@english/database/testing";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { grade } from "../src/modules/assessment/grading";
import { checkConsistency, questionInput, type QuestionInput } from "../src/modules/assessment/schemas";
import { LESSON_PARTS } from "../src/modules/resources/checklist";
import { codeOf, createHarness, type Harness } from "./helpers";

// IELTS-style question types (ADR 0008): their checks, their marking, and questions drafted by the local language
// model (this test plays the worker) that editors approve into the lesson's exercises or remove.

const check = (q: QuestionInput) => checkConsistency(questionInput.parse(q));

describe("IELTS question types: checks and marking", () => {
  it("multiple choice: choose TWO, one mark each, nothing for ticking too many", () => {
    // Fewer than two correct letters isn't a "choose TWO" question at all.
    expect(
      questionInput.safeParse({
        type: "MULTIPLE_CHOICE",
        prompt: { stem: "Which TWO?", choose: 2 },
        options: ["a", "b", "c", "d"],
        grading: { type: "MULTIPLE_CHOICE", correctOptions: [0] },
      }).success
    ).toBe(false);
    expect(
      check({
        type: "MULTIPLE_CHOICE",
        prompt: { stem: "Which TWO?", choose: 3 },
        options: ["a", "b", "c", "d"],
        grading: { type: "MULTIPLE_CHOICE", correctOptions: [0, 2] },
      })
    ).toMatch(/exactly that many/);
    const key = { type: "MULTIPLE_CHOICE" as const, correctOptions: [0, 2] };
    expect(grade(key, { optionIndexes: [0, 2] }, 2)).toMatchObject({ awardedPoints: 2, correct: true });
    expect(grade(key, { optionIndexes: [0, 1] }, 2)).toMatchObject({ awardedPoints: 1, correct: false });
    expect(grade(key, { optionIndexes: [0, 1, 2] }, 2).awardedPoints).toBe(0);
  });

  it("yes / no / not given", () => {
    const key = { type: "YES_NO_NOT_GIVEN" as const, answer: "NO" as const };
    expect(grade(key, { judgement: "NO" }, 1).correct).toBe(true);
    expect(grade(key, { judgement: "FALSE" }, 1).correct).toBe(false);
  });

  it("matching: one mark per item; an option used twice needs 'reuse'", () => {
    const q: QuestionInput = {
      type: "MATCHING",
      prompt: {
        variant: "INFORMATION",
        items: [
          { itemId: "i1", text: "a reason for a delay" },
          { itemId: "i2", text: "a reaction to the delay" },
        ],
      },
      options: ["A", "B", "C"],
      grading: {
        type: "MATCHING",
        matches: [
          { itemId: "i1", option: 2 },
          { itemId: "i2", option: 2 },
        ],
      },
    };
    expect(check(q)).toMatch(/used more than once/);
    expect(check({ ...q, prompt: { ...q.prompt, reuse: true } } as QuestionInput)).toBeNull();
    const key = {
      type: "MATCHING" as const,
      matches: [
        { itemId: "i1", option: 2 },
        { itemId: "i2", option: 1 },
      ],
    };
    expect(
      grade(
        key,
        {
          matches: [
            { itemId: "i1", optionIndex: 2 },
            { itemId: "i2", optionIndex: 0 },
          ],
        },
        2
      )
    ).toMatchObject({
      awardedPoints: 1,
      correct: false,
    });
  });

  it("completion: one mark per gap, answers over the word limit are wrong, a word box holds the answers", () => {
    const q: QuestionInput = {
      type: "COMPLETION",
      prompt: {
        variant: "SENTENCE",
        segments: [
          { text: "Mia cycles along the " },
          { gapId: "g1" },
          { text: " on " },
          { gapId: "g2" },
          { text: "." },
        ],
        wordLimit: 1,
      },
      grading: {
        type: "COMPLETION",
        gaps: [
          { gapId: "g1", accepted: ["river"] },
          { gapId: "g2", accepted: ["sunny days"] },
        ],
      },
    };
    expect(check(q)).toMatch(/word limit/);
    const key = {
      type: "COMPLETION" as const,
      gaps: [
        { gapId: "g1", accepted: ["river"], caseSensitive: false },
        { gapId: "g2", accepted: ["Mondays"], caseSensitive: false },
      ],
    };
    expect(
      grade(
        key,
        {
          gaps: [
            { gapId: "g1", text: " River " },
            { gapId: "g2", text: "Tuesdays" },
          ],
        },
        2,
        1
      )
    ).toMatchObject({
      awardedPoints: 1,
    });
    expect(
      grade(
        key,
        {
          gaps: [
            { gapId: "g1", text: "the river" },
            { gapId: "g2", text: "mondays" },
          ],
        },
        2,
        1
      )
    ).toMatchObject({
      awardedPoints: 1, // "the river" is two words: over the limit, so wrong
    });
    expect(
      check({
        ...q,
        prompt: { ...q.prompt, wordLimit: 2, wordBox: ["river", "road", "park"] },
      } as QuestionInput)
    ).toMatch(/word box/);
  });

  it("short answer: within the word limit, from the accepted answers", () => {
    const key = { type: "SHORT_ANSWER" as const, accepted: ["forty minutes", "40 minutes"] };
    expect(grade(key, { text: "40 Minutes" }, 1, 3).correct).toBe(true);
    expect(grade(key, { text: "about forty minutes long" }, 1, 3).correct).toBe(false);
  });
});

const SCRIPT =
  "Mia lives in a small town and works in the city. Every morning she cycles along the river to the station. " +
  "Her commute takes about forty minutes. On rainy days she takes the bus instead, which she finds slow but relaxing.";

describe.skipIf(!testDatabaseUrl)("drafted questions, approved by editors", () => {
  let h: Harness;
  let resourceId: string;
  let localizationId: string;
  const CLAIM = `mutation { claimJob(types: ["questions.suggest"]) { id payload claimToken } }`;
  const COMPLETE = `mutation($job: ID!, $token: String!, $result: JobPayload!) { completeJob(jobId: $job, claimToken: $token, result: $result) }`;
  const STATE = `query($id: ID!) { editorialResource(id: $id) { localizations { draft { lockVersion exercises
    questionSuggestions { state usedLanguageModel items { id status type question } } } } } }`;
  const owner = () => ({ token: h.people.ownerA.token });

  beforeAll(async () => {
    h = await createHarness({ requiredParts: LESSON_PARTS });
    for (;;) {
      const job = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as {
        id: string;
        claimToken: string;
      } | null;
      if (!job) break;
      await h.gql(
        COMPLETE,
        { job: job.id, token: job.claimToken, result: { ai: false, questions: [] } },
        { worker: true }
      );
    }
  }, 60_000);
  afterAll(async () => h?.drop());

  const state = async () =>
    (
      (await h.gql(STATE, { id: resourceId }, owner())).data?.editorialResource as {
        localizations: {
          draft: {
            lockVersion: number;
            exercises: { title: string; instructions?: string; questions: { type: string }[] }[];
            questionSuggestions: {
              state: string;
              items: { id: string; status: string; type: string; question: { prompt: unknown } }[];
            };
          };
        }[];
      }
    ).localizations[0]!.draft;

  it("keeps only drafts that pass every check, with typed answers taken from the script", async () => {
    const created = await h.gql(
      `mutation($input: CreateResourceInput!) { createResource(input: $input) { id localizations { id } } }`,
      {
        input: {
          siteId: h.a.siteId,
          kind: "READING",
          slug: "drafted-questions",
          title: "Drafted",
          body: {
            type: "doc",
            content: [{ type: "paragraph", attrs: { id: "para-1" }, content: [{ type: "text", text: SCRIPT }] }],
          },
        },
      },
      owner()
    );
    ({ id: resourceId } = created.data?.createResource as { id: string });
    localizationId = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!.id;
    expect((await state()).questionSuggestions.state).toBe("IDLE"); // only the "Suggest questions" button starts it
    const suggest = await h.gql(
      `mutation($loc: ID!) { suggestQuestions(localizationId: $loc) }`,
      { loc: localizationId },
      owner()
    );
    expect(suggest.data).toEqual({ suggestQuestions: true });
    expect((await state()).questionSuggestions.state).toBe("WORKING");

    const job = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as {
      id: string;
      claimToken: string;
      payload: { blocks: { letter: string }[] };
    };
    expect(job.payload.blocks.map((b) => b.letter)).toEqual(["A"]);
    const questions = [
      {
        type: "TRUE_FALSE_NOT_GIVEN",
        prompt: { statement: "Mia drives to the station." },
        grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "FALSE" },
        explanation: "From the text: she cycles along the river to the station.",
      },
      {
        type: "SINGLE_CHOICE",
        prompt: { stem: "How long is Mia's commute?" },
        options: ["Twenty minutes", "About forty minutes", "An hour", "Two hours"],
        grading: { type: "SINGLE_CHOICE", correctOption: 1 },
      },
      {
        type: "COMPLETION",
        prompt: {
          variant: "SENTENCE",
          segments: [{ text: "On rainy days Mia takes the " }, { gapId: "g1" }, { text: "." }],
          wordLimit: 2,
        },
        grading: { type: "COMPLETION", gaps: [{ gapId: "g1", accepted: ["bus"] }] },
      },
      // Not from the script ("train"): dropped.
      {
        type: "SHORT_ANSWER",
        prompt: { question: "What does Mia take on rainy days?", wordLimit: 2 },
        grading: { type: "SHORT_ANSWER", accepted: ["train"] },
      },
      // Broken (the correct option doesn't exist): dropped.
      {
        type: "SINGLE_CHOICE",
        prompt: { stem: "Where does Mia live?" },
        options: ["A city", "A small town"],
        grading: { type: "SINGLE_CHOICE", correctOption: 5 },
      },
    ];
    const done = await h.gql(
      COMPLETE,
      { job: job.id, token: job.claimToken, result: { ai: true, questions } },
      { worker: true }
    );
    expect(done.errors).toBeUndefined();
    const s = (await state()).questionSuggestions;
    expect(s.state).toBe("DONE");
    expect(s.items.map((i) => [i.type, i.status])).toEqual([
      ["TRUE_FALSE_NOT_GIVEN", "PENDING"],
      ["SINGLE_CHOICE", "PENDING"],
      ["COMPLETION", "PENDING"],
    ]);
  });

  it("approving adds questions to the exercises, in a set per IELTS task with its instructions", async () => {
    const before = await state();
    const [tfng, mc, completionQ] = before.questionSuggestions.items;
    const reject = await h.gql(
      `mutation($loc: ID!, $ids: [ID!]!) { rejectQuestionSuggestions(localizationId: $loc, ids: $ids) }`,
      { loc: localizationId, ids: [mc!.id] },
      { token: h.people.editorA.token }
    );
    expect(reject.data?.rejectQuestionSuggestions).toBe(true);
    const APPROVE = `mutation($loc: ID!, $v: Int!, $ids: [ID!]!) { approveQuestionSuggestions(localizationId: $loc, lockVersion: $v, ids: $ids) { id } }`;
    const approved = await h.gql(
      APPROVE,
      { loc: localizationId, v: before.lockVersion, ids: [tfng!.id, completionQ!.id] },
      { token: h.people.editorA.token }
    );
    expect(approved.errors).toBeUndefined();
    const after = await state();
    expect(after.lockVersion).toBe(before.lockVersion + 1);
    expect(after.exercises.map((s) => [s.title, s.questions.map((q) => q.type)])).toEqual([
      ["True / False / Not Given", ["TRUE_FALSE_NOT_GIVEN"]],
      ["Sentence completion", ["COMPLETION"]],
    ]);
    expect(after.exercises[0]!.instructions).toMatch(/agree with the information given in the text/);
    expect(after.questionSuggestions.items.map((i) => i.status)).toEqual(["APPROVED", "REJECTED", "APPROVED"]);
    expect(codeOf(await h.gql(APPROVE, { loc: localizationId, v: before.lockVersion, ids: [mc!.id] }, owner()))).toBe(
      "CONFLICT"
    );
  });
});
