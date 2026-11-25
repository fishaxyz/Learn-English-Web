import { schema } from "@english/database";
import { testDatabaseUrl } from "@english/database/testing";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { annotationsOf, type RichTextDocument } from "../src/modules/rich-text";
import { addLexicalMark } from "../src/modules/lexicon/suggestions";
import { codeOf, createHarness, type Harness } from "./helpers";

// Suggested vocabulary: saving a script queues the vocab.suggest job; the worker (this test) sends back what it
// found; editors approve items (linked in the text as key words, new ones added to the word bank as drafts) or
// remove them. No language model is called here.

const CREATE = `mutation($input: CreateResourceInput!) { createResource(input: $input) { id localizations { id } } }`;
const CLAIM = `mutation { claimJob(types: ["vocab.suggest"]) { id payload claimToken } }`;
const COMPLETE = `mutation($job: ID!, $token: String!, $result: JobPayload!) { completeJob(jobId: $job, claimToken: $token, result: $result) }`;
const STATE = `query($id: ID!) { editorialResource(id: $id) { localizations { draft { lockVersion body
  vocabularySuggestions { state usedLanguageModel items { id status kind displayForm surfaceText sentence definition inWordBank source } } } } } }`;
const APPROVE = `mutation($loc: ID!, $v: Int!, $ids: [ID!]!) { approveVocabularySuggestions(localizationId: $loc, lockVersion: $v, ids: $ids) { id } }`;
const REJECT = `mutation($loc: ID!, $ids: [ID!]!) { rejectVocabularySuggestions(localizationId: $loc, ids: $ids) }`;

const doc = (text: string): RichTextDocument => ({
  type: "doc",
  content: [{ type: "paragraph", attrs: { id: "para-1" }, content: [{ type: "text", text }] }],
});
const TEXT = "Her commute is long. Zoë gave up smoking: it was a piece of cake.";
const at = (part: string) => {
  const start = [...TEXT.slice(0, TEXT.indexOf(part))].length;
  return { blockId: "para-1", start, end: start + [...part].length, surfaceText: part };
};

describe("adding a vocabulary link to a text", () => {
  it("splits the text node and marks just the span, in code points", () => {
    const out = addLexicalMark(
      doc("Zoë 🚆 gave up."),
      { blockId: "para-1", start: 6, end: 13 },
      {
        senseRevisionId: "00000000-0000-4000-8000-000000000001",
        key: true,
      }
    );
    expect(out.content[0]?.content).toEqual([
      { type: "text", text: "Zoë 🚆 " },
      {
        type: "text",
        text: "gave up",
        marks: [{ type: "lexical", attrs: { senseRevisionId: "00000000-0000-4000-8000-000000000001", key: true } }],
      },
      { type: "text", text: "." },
    ]);
    expect(annotationsOf(out)).toMatchObject([{ start: 6, end: 13, surfaceText: "gave up", isKey: true }]);
  });
});

describe.skipIf(!testDatabaseUrl)("vocabulary suggestions", () => {
  let h: Harness;
  let resourceId: string;
  let localizationId: string;
  beforeAll(async () => {
    h = await createHarness();
    // The seed's sample lessons queued suggestion jobs too: finish them first, with nothing found.
    for (;;) {
      const job = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as {
        id: string;
        claimToken: string;
      } | null;
      if (!job) break;
      await h.gql(
        COMPLETE,
        { job: job.id, token: job.claimToken, result: { ai: false, suggestions: [] } },
        { worker: true }
      );
    }
  }, 60_000);
  afterAll(async () => h?.drop());

  const owner = () => ({ token: h.people.ownerA.token });
  const state = async () =>
    (
      (await h.gql(STATE, { id: resourceId }, owner())).data?.editorialResource as {
        localizations: {
          draft: {
            lockVersion: number;
            body: RichTextDocument;
            vocabularySuggestions: {
              state: string;
              usedLanguageModel: boolean | null;
              items: { id: string; status: string; displayForm: string; inWordBank: boolean; sentence: string }[];
            };
          };
        }[];
      }
    ).localizations[0]!.draft;

  it("queues a job when the script is saved, and keeps what the worker found that really is in the text", async () => {
    const created = await h.gql(
      CREATE,
      { input: { siteId: h.a.siteId, kind: "READING", slug: "suggested", title: "Suggested", body: doc(TEXT) } },
      owner()
    );
    ({ id: resourceId } = created.data?.createResource as { id: string });
    localizationId = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!.id;
    expect((await state()).vocabularySuggestions.state).toBe("WORKING");

    const job = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as {
      id: string;
      claimToken: string;
      payload: { textHash: string; blocks: { blockId: string; text: string }[] };
    };
    expect(job.payload.blocks).toEqual([{ blockId: "para-1", text: TEXT }]);
    const item = (kind: string, displayForm: string, part: string, extra: object = {}) => ({
      kind,
      displayForm,
      partOfSpeech: kind === "WORD" ? "noun" : kind === "PHRASAL_VERB" ? "phrasal verb" : "idiom",
      ...at(part),
      definition: null,
      cefrLevel: null,
      zipf: null,
      source: "nlp",
      ...extra,
    });
    const result = {
      ai: true,
      suggestions: [
        item("WORD", "commute", "commute"),
        item("PHRASAL_VERB", "give up", "gave up", { definition: "to stop doing something", source: "ai" }),
        item("IDIOM", "a piece of cake", "a piece of cake", { definition: "very easy", source: "ai", cefrLevel: "B1" }),
        item("WORD", "cake", "cake"), // inside the idiom: dropped
        { ...item("WORD", "bus", "commute"), surfaceText: "bus" }, // not what the text says: dropped
      ],
    };
    const done = await h.gql(COMPLETE, { job: job.id, token: job.claimToken, result }, { worker: true });
    expect(done.errors).toBeUndefined();

    const s = (await state()).vocabularySuggestions;
    expect(s.state).toBe("DONE");
    expect(s.usedLanguageModel).toBe(true);
    expect(s.items.map((i) => [i.displayForm, i.status, i.inWordBank])).toEqual([
      ["commute", "PENDING", true], // the seed's word bank has it
      ["give up", "PENDING", false],
      ["a piece of cake", "PENDING", false],
    ]);
    expect(s.items[1]!.sentence).toBe("Zoë gave up smoking: it was a piece of cake.");
  });

  it("approves: links in the text as key words, adds new items to the word bank as drafts; removes others", async () => {
    const before = await state();
    const [commute, giveUp, cake] = before.vocabularySuggestions.items;
    expect(
      await h.gql(REJECT, { loc: localizationId, ids: [cake!.id] }, { token: h.people.editorA.token })
    ).toMatchObject({ data: { rejectVocabularySuggestions: true } });

    const approved = await h.gql(
      APPROVE,
      { loc: localizationId, v: before.lockVersion, ids: [commute!.id, giveUp!.id] },
      { token: h.people.editorA.token }
    );
    expect(approved.errors).toBeUndefined();
    const after = await state();
    expect(after.lockVersion).toBe(before.lockVersion + 1);
    expect(annotationsOf(after.body).map((a) => [a.surfaceText, a.isKey])).toEqual([
      ["commute", true],
      ["gave up", true],
    ]);
    expect(after.vocabularySuggestions.items.map((i) => i.status)).toEqual(["APPROVED", "APPROVED", "REJECTED"]);

    // "give up" is new: a draft entry with the suggested meaning and the sentence as its example.
    const [entry] = await h.t.db
      .select()
      .from(schema.lexicalEntries)
      .where(
        and(eq(schema.lexicalEntries.siteId, h.a.siteId), eq(schema.lexicalEntries.normalizedHeadword, "give up"))
      );
    expect(entry).toMatchObject({ displayForm: "give up", kind: "PHRASAL_VERB" });
    const [revision] = await h.t.db
      .select()
      .from(schema.lexicalSenseRevisions)
      .innerJoin(schema.lexicalSenses, eq(schema.lexicalSenses.id, schema.lexicalSenseRevisions.senseId))
      .where(eq(schema.lexicalSenses.entryId, entry!.id));
    expect(revision!.lexical_sense_revisions).toMatchObject({
      status: "DRAFT",
      definitionEn: "to stop doing something",
    });

    // The lesson can't go out with an unchecked word: its meaning must be published first.
    const publish = await h.gql(
      `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { id } }`,
      { id: localizationId, v: after.lockVersion },
      owner()
    );
    expect(codeOf(publish)).toBe("CONFLICT");
    expect(publish.errors?.[0]?.message).toMatch(/linked word senses/);

    // An approval with an old lock version is refused.
    expect(codeOf(await h.gql(APPROVE, { loc: localizationId, v: before.lockVersion, ids: [cake!.id] }, owner()))).toBe(
      "CONFLICT"
    );
  });

  it("a new text drops pending suggestions and queues a new job; the worker can renew a long job's lease", async () => {
    const before = await state();
    const update = await h.gql(
      `mutation($input: UpdateDraftInput!) { updateDraft(input: $input) { id } }`,
      { input: { localizationId, lockVersion: before.lockVersion, body: doc("A different text about trains.") } },
      owner()
    );
    expect(update.errors).toBeUndefined();
    const after = (await state()).vocabularySuggestions;
    expect(after).toMatchObject({ state: "WORKING", items: [] });

    const job = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as { id: string; claimToken: string };
    const RENEW = `mutation($job: ID!, $token: String!) { renewJobLease(jobId: $job, claimToken: $token) }`;
    expect((await h.gql(RENEW, { job: job.id, token: job.claimToken }, { worker: true })).data).toEqual({
      renewJobLease: true,
    });
    expect(codeOf(await h.gql(RENEW, { job: job.id, token: job.claimToken }, owner()))).toBe("FORBIDDEN");
    expect(codeOf(await h.gql(RENEW, { job: job.id, token: "stale" }, { worker: true }))).toBe("CONFLICT");
  });
});
