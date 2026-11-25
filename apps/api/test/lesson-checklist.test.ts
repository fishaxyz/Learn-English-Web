import { schema } from "@english/database";
import { testDatabaseUrl } from "@english/database/testing";
import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ttsTextOf } from "../src/modules/audio/service";
import { LESSON_PARTS } from "../src/modules/resources/checklist";
import type { RichTextDocument } from "../src/modules/rich-text";
import { codeOf, createHarness, type Harness } from "./helpers";

// A reading lesson can always be saved, but it's only reviewed or published once its four parts are finished:
// script, an approved voice-over, linked vocabulary and questions.

const CREATE = `mutation($input: CreateResourceInput!) { createResource(input: $input) { id localizations { id } } }`;
const CHECK = `query($id: ID!) { editorialResource(id: $id) { localizations { draft { lockVersion checklist {
  script voiceover vocabulary questions missing } } } } }`;
const PUBLISH_NOW = `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { id } }`;
const SUBMIT = `mutation($id: ID!, $v: Int!) { submitForReview(localizationId: $id, lockVersion: $v) { id } }`;
const SAVE_SETS = `mutation($id: ID!, $v: Int!, $sets: ExercisePayload!) {
  saveExerciseSets(localizationId: $id, lockVersion: $v, sets: $sets) { id } }`;

describe.skipIf(!testDatabaseUrl)("finishing a reading lesson before it goes out", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({ requiredParts: LESSON_PARTS });
  }, 60_000);
  afterAll(async () => h?.drop());

  it("lists what's missing, refuses review and publishing until it's done, then publishes", async () => {
    const owner = { token: h.people.ownerA.token };
    const [sense] = await h.t.db
      .select({ id: schema.lexicalSenses.publishedRevisionId })
      .from(schema.lexicalSenses)
      .innerJoin(schema.lexicalEntries, eq(schema.lexicalSenses.entryId, schema.lexicalEntries.id))
      .where(and(eq(schema.lexicalEntries.siteId, h.a.siteId), isNotNull(schema.lexicalSenses.publishedRevisionId)))
      .limit(1);
    const body: RichTextDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "para-1" },
          content: [
            { type: "text", text: "Her " },
            { type: "text", text: "commute", marks: [{ type: "lexical", attrs: { senseRevisionId: sense!.id! } }] },
            { type: "text", text: " is long." },
          ],
        },
      ],
    };
    const created = await h.gql(
      CREATE,
      { input: { siteId: h.a.siteId, kind: "READING", slug: "finished-lesson", title: "Finished", body } },
      owner
    );
    expect(created.errors?.[0]?.message).toBeUndefined();
    const { id: resourceId, localizations } = created.data?.createResource as {
      id: string;
      localizations: { id: string }[];
    };
    const localizationId = localizations[0]!.id;
    const check = async () =>
      (
        (await h.gql(CHECK, { id: resourceId }, owner)).data?.editorialResource as {
          localizations: { draft: { lockVersion: number; checklist: Record<string, unknown> } }[];
        }
      ).localizations[0]!.draft;

    expect((await check()).checklist).toEqual({
      script: true,
      voiceover: false,
      vocabulary: true,
      questions: false,
      missing: ["VOICEOVER", "QUESTIONS"],
    });
    const refused = await h.gql(PUBLISH_NOW, { id: localizationId, v: 0 }, owner);
    expect(codeOf(refused)).toBe("CONFLICT");
    expect(refused.errors?.[0]?.message).toMatch(/approved voice-over, questions/);
    expect(codeOf(await h.gql(SUBMIT, { id: localizationId, v: 0 }, owner))).toBe("CONFLICT");

    // Questions: saved like any other change.
    const sets = [
      {
        title: "Check",
        questions: [
          {
            type: "TRUE_FALSE_NOT_GIVEN",
            points: 1,
            prompt: { statement: "It's short." },
            grading: { type: "TRUE_FALSE_NOT_GIVEN", answer: "FALSE" },
          },
        ],
      },
    ];
    expect((await h.gql(SAVE_SETS, { id: localizationId, v: 0, sets }, owner)).errors).toBeUndefined();

    // A voice-over that's approved but no longer matches the text doesn't count.
    const [draft] = await h.t.db
      .select()
      .from(schema.resourceRevisions)
      .where(eq(schema.resourceRevisions.localizationId, localizationId));
    const track = {
      siteId: h.a.siteId,
      revisionId: draft!.id,
      provider: "fake",
      voiceId: "fake-woman-uk",
      voiceName: "Test voice",
      gender: "female",
      accent: "uk",
      characters: 20,
      status: "APPROVED" as const,
    };
    await h.t.db.insert(schema.audioTracks).values({ ...track, textHash: "an-older-text" });
    expect((await check()).checklist).toMatchObject({ voiceover: false, missing: ["VOICEOVER"] });
    await h.t.db.insert(schema.audioTracks).values({ ...track, textHash: ttsTextOf(body).hash });
    const ready = await check();
    expect(ready.checklist).toMatchObject({ voiceover: true, questions: true, missing: [] });

    // The out-of-date one still blocks publishing (it would go live reading the wrong text): delete it.
    await h.t.db.delete(schema.audioTracks).where(eq(schema.audioTracks.textHash, "an-older-text"));
    const published = await h.gql(PUBLISH_NOW, { id: localizationId, v: ready.lockVersion }, owner);
    expect(published.errors).toBeUndefined();
  });
});
