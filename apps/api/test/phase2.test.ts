import { schema } from "@english/database";
import { testDatabaseUrl } from "@english/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/modules/rate-limit";
import type { Revalidator } from "../src/modules/revalidate";
import { codeOf, createHarness, type Harness } from "./helpers";

const EDITORIAL = `fragment R on EditorialResource {
  id kind
  localizations { id slug draft { id status lockVersion exercises vocabulary { senseKey } } published { id revisionNo } }
}`;

describe.skipIf(!testDatabaseUrl)("Phase 2 API", () => {
  let h: Harness;
  const notified: string[][] = [];
  const revalidator: Revalidator = {
    notify: async (tags) => {
      notified.push(tags);
      return [true];
    },
  };
  let clock = 0;

  beforeAll(async () => {
    h = await createHarness({ revalidator, rateLimiter: createRateLimiter(() => clock) });
  }, 60_000);
  afterAll(async () => {
    await h?.drop();
  });

  async function senseRevision(key: string) {
    const [sense] = await h.t.db.select().from(schema.lexicalSenses).where(eq(schema.lexicalSenses.senseKey, key));
    return sense!;
  }

  const bodyLinking = (senseRevisionId: string) => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { id: "para-1" },
        content: [
          { type: "text", text: "🚆 My " },
          { type: "text", text: "commute", marks: [{ type: "lexical", attrs: { senseRevisionId } }] },
          { type: "text", text: " is short." },
        ],
      },
    ],
  });

  it("derives vocabulary links from the text, with code-point offsets, and shows them once published", async () => {
    const commute = await senseRevision("commute-noun");
    const created = await h.gql(
      `${EDITORIAL} mutation($input: CreateResourceInput!) { createResource(input: $input) { ...R } }`,
      {
        input: {
          siteId: h.a.siteId,
          kind: "READING",
          slug: "short-commute",
          title: "A Short Commute",
          body: bodyLinking(commute.publishedRevisionId!),
        },
      },
      { token: h.people.editorA.token }
    );
    expect(created.errors).toBeUndefined();
    const loc = (created.data?.createResource as { localizations: { id: string; draft: { id: string } }[] })
      .localizations[0]!;
    const [annotation] = await h.t.db
      .select()
      .from(schema.lexicalAnnotations)
      .where(eq(schema.lexicalAnnotations.revisionId, loc.draft.id));
    // "🚆 My " is 5 code points (the emoji is one), so "commute" spans 5–12.
    expect(annotation).toMatchObject({ blockId: "para-1", start: 5, end: 12, surfaceText: "commute" });

    await h.gql(
      `mutation($id: ID!) { submitForReview(localizationId: $id, lockVersion: 0) { id } }`,
      { id: loc.id },
      { token: h.people.editorA.token }
    );
    await h.gql(
      `mutation($id: ID!) { publishResource(localizationId: $id, lockVersion: 1) { id } }`,
      { id: loc.id },
      { token: h.people.reviewerA.token }
    );
    const lesson = await h.gql(
      `{ resourceBySlug(kind: READING, slug: "short-commute") { ... on ReadingResource { vocabulary { senseKey definition } } } }`
    );
    expect(lesson.data?.resourceBySlug).toEqual({
      vocabulary: [{ senseKey: "commute-noun", definition: expect.stringContaining("journey") }],
    });
    // And the website was told to refresh this lesson's pages.
    expect(notified).toContainEqual(["resources", "resource:READING:short-commute"]);
  });

  it("publishing a text also publishes the draft sense it links to (for now: ADR 0007)", async () => {
    const draftSense = await h.gql(
      `mutation($input: ManageLexicalSenseInput!) { manageLexicalSense(input: $input) { draft { id } } }`,
      {
        input: {
          siteId: h.a.siteId,
          headword: "platform",
          kind: "WORD",
          partOfSpeech: "noun",
          senseKey: "platform-station",
          definition: "the part of a station where you get on a train",
        },
      },
      { token: h.people.editorA.token }
    );
    const revisionId = (draftSense.data?.manageLexicalSense as { draft: { id: string } }).draft.id;
    const created = await h.gql(
      `${EDITORIAL} mutation($input: CreateResourceInput!) { createResource(input: $input) { ...R } }`,
      {
        input: {
          siteId: h.a.siteId,
          kind: "READING",
          slug: "on-the-platform",
          title: "On the Platform",
          body: bodyLinking(revisionId),
        },
      },
      { token: h.people.editorA.token }
    );
    const loc = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!;
    await h.gql(
      `mutation($id: ID!) { submitForReview(localizationId: $id, lockVersion: 0) { id } }`,
      { id: loc.id },
      { token: h.people.editorA.token }
    );
    const pub = await h.gql(
      `mutation($id: ID!) { publishResource(localizationId: $id, lockVersion: 1) { id } }`,
      { id: loc.id },
      { token: h.people.reviewerA.token }
    );
    expect(pub.errors).toBeUndefined();
    const sense = await h.gql(
      `query($q: String!) { lexicalSearch(query: $q, first: 5) { displayForm senses { revisionId } } }`,
      { q: "platform" },
      { token: h.people.editorA.token }
    );
    // The linked revision is now the published one, so the word can be found in the word bank.
    expect(
      (sense.data?.lexicalSearch as { senses: { revisionId: string }[] }[]).flatMap((e) =>
        e.senses.map((x) => x.revisionId)
      )
    ).toContain(revisionId);
  });

  it("saves exercises on a draft, gives them back to editors, and validates them whole", async () => {
    const created = await h.gql(
      `${EDITORIAL} mutation($input: CreateResourceInput!) { createResource(input: $input) { ...R } }`,
      { input: { siteId: h.a.siteId, kind: "READING", slug: "exercise-draft", title: "Exercise draft" } },
      { token: h.people.editorA.token }
    );
    const loc = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!;
    const sets = [
      {
        title: "Check",
        questions: [
          {
            type: "TRUE_FALSE_NOT_GIVEN",
            prompt: { statement: "It rains." },
            grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "TRUE" },
          },
          {
            type: "SINGLE_CHOICE",
            prompt: { stem: "Pick" },
            options: ["a", "b"],
            grading: { type: "SINGLE_CHOICE", correctOption: 1 },
            explanation: "b is right",
          },
        ],
      },
    ];
    const SAVE = `${EDITORIAL} mutation($id: ID!, $v: Int!, $sets: ExercisePayload!) { saveExerciseSets(localizationId: $id, lockVersion: $v, sets: $sets) { ...R } }`;
    const saved = await h.gql(SAVE, { id: loc.id, v: 0, sets }, { token: h.people.editorA.token });
    expect(saved.errors).toBeUndefined();
    const draft = (
      saved.data?.saveExerciseSets as { localizations: { draft: { lockVersion: number; exercises: unknown } }[] }
    ).localizations[0]!.draft;
    expect(draft.lockVersion).toBe(1);
    expect(draft.exercises).toEqual([
      {
        title: "Check",
        questions: [
          {
            type: "TRUE_FALSE_NOT_GIVEN",
            points: 1,
            prompt: { statement: "It rains." },
            grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "TRUE" },
          },
          {
            type: "SINGLE_CHOICE",
            points: 1,
            prompt: { stem: "Pick" },
            options: ["a", "b"],
            grading: { type: "SINGLE_CHOICE", correctOption: 1 },
            explanation: "b is right",
          },
        ],
      },
    ]);

    // One bad question rejects the whole save, and nothing changes.
    const bad = [
      {
        title: "Bad",
        questions: [
          {
            type: "SINGLE_CHOICE",
            prompt: { stem: "?" },
            options: ["a", "b"],
            grading: { type: "SINGLE_CHOICE", correctOption: 5 },
          },
        ],
      },
    ];
    expect(codeOf(await h.gql(SAVE, { id: loc.id, v: 1, sets: bad }, { token: h.people.editorA.token }))).toBe(
      "VALIDATION_ERROR"
    );

    // Answer keys are editorial: a viewer may read drafts, an anonymous visitor may not.
    const asAnon = await h.gql(`${EDITORIAL} query($id: ID!) { editorialResource(id: $id) { ...R } }`, {
      id: (created.data?.createResource as { id: string }).id,
    });
    expect(codeOf(asAnon)).toBe("UNAUTHENTICATED");
  });

  it("lists a site's resources for its editors only", async () => {
    const LIST = `query($site: ID!) { editorialResources(siteId: $site) { id } }`;
    const mine = await h.gql(LIST, { site: h.a.siteId }, { token: h.people.viewerA.token });
    expect((mine.data?.editorialResources as unknown[]).length).toBeGreaterThanOrEqual(3);
    expect(codeOf(await h.gql(LIST, { site: h.a.siteId }, { token: h.people.editorB.token }))).toBe("NOT_FOUND");
  });

  it("rate-limits grading per client, and resets after the window", async () => {
    const GRADE = `mutation($input: GradePracticeInput!) { gradePractice(input: $input) { score } }`;
    const lesson = await h.gql(`{ resourceBySlug(kind: LISTENING, slug: "running-late") { exerciseSets { id } } }`);
    const setId = (lesson.data?.resourceBySlug as { exerciseSets: { id: string }[] }).exerciseSets[0]!.id;
    const input = { exerciseSetId: setId, answers: [] };
    clock = 1_000_000;
    for (let i = 0; i < 30; i++) expect((await h.gql(GRADE, { input })).errors).toBeUndefined();
    expect(codeOf(await h.gql(GRADE, { input }))).toBe("RATE_LIMITED");
    clock += 60_000;
    expect((await h.gql(GRADE, { input })).errors).toBeUndefined();
  });
});
