import { testDatabaseUrl } from "@english/database/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseLexicalList, sentenceWith } from "../src/modules/lexical-items/service";
import type { RichTextDocument } from "../src/modules/rich-text";
import { codeOf, createHarness, type Harness } from "./helpers";

// A lesson's own lexical vocabulary (ADR 0010): an editor adds a list, the worker (this test) explains each item,
// editors approve with edits, and learners see approved items once published. No language model is called.

const CREATE = `mutation($input: CreateResourceInput!) { createResource(input: $input) { id localizations { id } } }`;
const CLAIM = `mutation { claimJob(types: ["lexicon.explain"]) { id payload claimToken } }`;
const COMPLETE = `mutation($job: ID!, $token: String!, $result: JobPayload!) { completeJob(jobId: $job, claimToken: $token, result: $result) }`;
const STATE = `query($id: ID!) { editorialResource(id: $id) { localizations { draft { lockVersion
  lexicalItems { state usedLanguageModel items { id text note kind quote meaning synonyms example ieltsTip status inText } } } } } }`;
const ADD = `mutation($loc: ID!, $list: String!) { addLexicalList(localizationId: $loc, list: $list) { added skipped } }`;
const EXPLAIN = `mutation($loc: ID!, $redo: Boolean) { explainLexicalItems(localizationId: $loc, redoDrafts: $redo) }`;
const APPROVE = `mutation($loc: ID!, $items: [LexicalItemApproval!]!) { approveLexicalItems(localizationId: $loc, items: $items) }`;
const DELETE = `mutation($loc: ID!, $ids: [ID!]!) { deleteLexicalItems(localizationId: $loc, ids: $ids) }`;
const PUBLISH_NOW = `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { id } }`;
const START = `mutation($id: ID!) { startDraft(localizationId: $id) { id } }`;
const PUBLIC = `query($slug: String!) { resourceBySlug(kind: READING, slug: $slug) { ... on ReadingResource {
  lexicalItems { text kind meaning synonyms example ieltsTip inText } } } }`;

const doc = (...paragraphs: string[]): RichTextDocument => ({
  type: "doc",
  content: paragraphs.map((text, i) => ({
    type: "paragraph",
    attrs: { id: `para-${i + 1}` },
    content: [{ type: "text", text }],
  })),
});

describe("the editor's list", () => {
  it("is one item per line: bullets and numbers dropped, a note after a spaced dash, repeats once", () => {
    expect(
      parseLexicalList(
        "1. rely on\n- a grain of truth — idiom\n\n• pass on\tphrasal verb\nRely  on\n  set up - collocation, Task 2  \n"
      )
    ).toEqual([
      { text: "rely on", note: null },
      { text: "a grain of truth", note: "idiom" },
      { text: "pass on", note: "phrasal verb" },
      { text: "set up", note: "collocation, Task 2" },
    ]);
  });

  it("finds an item's sentence in the script, also when its words are split apart", () => {
    const d = doc("Farmers watched the sky. They passed their observations on to their children.");
    expect(sentenceWith(d, "passed … on")).toBe("They passed their observations on to their children.");
    expect(sentenceWith(d, "WATCHED THE SKY")).toBe("Farmers watched the sky.");
    expect(sentenceWith(d, "barometer")).toBeNull();
  });
});

type Item = {
  id: string;
  text: string;
  note: string | null;
  kind: string | null;
  quote: string | null;
  meaning: string | null;
  synonyms: string[];
  example: string | null;
  ieltsTip: string | null;
  status: string;
  inText: string | null;
};
type Job = {
  id: string;
  claimToken: string;
  payload: {
    items: { id: string; text: string; note: string | null }[];
    paragraphs: { blockId: string; text: string }[];
  };
};

describe.skipIf(!testDatabaseUrl)("lexical vocabulary", () => {
  let h: Harness;
  let resourceId: string;
  let localizationId: string;
  beforeAll(async () => {
    h = await createHarness();
  }, 60_000);
  afterAll(async () => h?.drop());

  const owner = () => ({ token: h.people.ownerA.token });
  const draft = async () =>
    (
      (await h.gql(STATE, { id: resourceId }, owner())).data?.editorialResource as {
        localizations: {
          draft: {
            lockVersion: number;
            lexicalItems: { state: string; usedLanguageModel: boolean | null; items: Item[] };
          } | null;
        }[];
      }
    ).localizations[0]!.draft!;
  const claim = async () => (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as Job | null;
  const complete = (job: Job, items: object[], ai = true) =>
    h.gql(COMPLETE, { job: job.id, token: job.claimToken, result: { ai, items } }, { worker: true });
  const explained = (id: string, over: object = {}) => ({
    id,
    kind: "KEYWORD",
    quote: null,
    meaning: "a meaning",
    synonyms: [],
    example: null,
    ieltsTip: null,
    ...over,
  });

  it("explains the editor's list in the background and lets editors approve with edits", async () => {
    const created = await h.gql(
      CREATE,
      {
        input: {
          siteId: h.a.siteId,
          kind: "READING",
          slug: "sky",
          title: "Reading the sky",
          body: doc(
            "For most of history, people had little to rely on except experience.",
            "Some sayings contained a grain of truth. Farmers passed their observations on."
          ),
        },
      },
      owner()
    );
    expect(created.errors).toBeUndefined();
    ({ id: resourceId } = created.data?.createResource as { id: string });
    localizationId = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!.id;

    expect((await draft()).lexicalItems).toEqual({ state: "IDLE", usedLanguageModel: null, items: [] });
    expect(codeOf(await h.gql(ADD, { loc: localizationId, list: " \n - \n" }, owner()))).toBe("VALIDATION_ERROR");
    expect(codeOf(await h.gql(ADD, { loc: localizationId, list: "rely on" }, { token: h.people.viewerA.token }))).toBe(
      "FORBIDDEN"
    );

    const added = await h.gql(
      ADD,
      { loc: localizationId, list: "rely on\na grain of truth — idiom\npass on — phrasal verb\nRELY ON" },
      owner()
    );
    expect(added.data).toEqual({ addLexicalList: { added: 3, skipped: 1 } });
    const waiting = (await draft()).lexicalItems;
    expect(waiting.state).toBe("WORKING");
    expect(waiting.items.map((i) => [i.text, i.note, i.status, i.inText])).toEqual([
      ["rely on", null, "PENDING", "For most of history, people had little to rely on except experience."],
      ["a grain of truth", "idiom", "PENDING", "Some sayings contained a grain of truth."],
      ["pass on", "phrasal verb", "PENDING", null], // its words are split apart: the AI's quote will find it
    ]);
    // One list at a time.
    expect(codeOf(await h.gql(ADD, { loc: localizationId, list: "set up" }, owner()))).toBe("CONFLICT");

    const job = (await claim())!;
    expect(job.payload.items.map((i) => [i.text, i.note])).toEqual([
      ["rely on", null],
      ["a grain of truth", "idiom"],
      ["pass on", "phrasal verb"],
    ]);
    expect(job.payload.paragraphs.map((p) => p.blockId)).toEqual(["para-1", "para-2"]);
    const [rely, grain, pass] = job.payload.items;
    const done = await complete(job, [
      explained(rely!.id, {
        quote: "rely on",
        meaning: "to  depend on something ",
        synonyms: ["depend on", "count on", "depend on", ""],
        example: "Many students rely on their notes.",
        ieltsTip: "Common in Writing Task 2.",
      }),
      explained(grain!.id, { kind: "IDIOM", quote: "a grain of sand", meaning: "a small amount of truth" }), // quote not in the text
      explained(pass!.id, { kind: "SOMETHING", quote: "passed … on", meaning: "to give to others" }),
      explained("00000000-0000-4000-8000-000000000000"), // never asked: ignored
    ]);
    expect(done.errors).toBeUndefined();

    const now = (await draft()).lexicalItems;
    expect(now.state).toBe("DONE");
    expect(now.usedLanguageModel).toBe(true);
    expect(now.items.map((i) => [i.status, i.kind, i.quote, i.meaning, i.synonyms])).toEqual([
      ["DRAFT", "KEYWORD", "rely on", "to depend on something", ["depend on", "count on"]],
      ["DRAFT", "IDIOM", null, "a small amount of truth", []], // an invented quote is dropped
      ["DRAFT", "KEYWORD", "passed … on", "to give to others", []], // an unknown kind becomes a keyword
    ]);
    expect(now.items[2]!.inText).toBe("Farmers passed their observations on.");

    // Editors approve with their own wording; viewers can't; a meaning is required.
    const item = now.items[1]!;
    const approval = {
      id: item.id,
      kind: "IDIOM",
      meaning: "a small part that is true",
      synonyms: ["an element of truth"],
    };
    expect(
      codeOf(await h.gql(APPROVE, { loc: localizationId, items: [approval] }, { token: h.people.viewerA.token }))
    ).toBe("FORBIDDEN");
    expect(codeOf(await h.gql(APPROVE, { loc: localizationId, items: [{ ...approval, meaning: " " }] }, owner()))).toBe(
      "VALIDATION_ERROR"
    );
    expect((await h.gql(APPROVE, { loc: localizationId, items: [approval] }, owner())).data).toEqual({
      approveLexicalItems: 1,
    });
    const after = (await draft()).lexicalItems.items[1]!;
    expect([after.status, after.meaning, after.synonyms]).toEqual([
      "APPROVED",
      "a small part that is true",
      ["an element of truth"],
    ]);

    // Explaining again redoes unapproved items only; without the local AI, nothing changes and it says so.
    expect((await h.gql(EXPLAIN, { loc: localizationId, redo: true }, owner())).data).toEqual({
      explainLexicalItems: true,
    });
    const again = (await claim())!;
    expect(again.payload.items.map((i) => i.text)).toEqual(["rely on", "pass on"]);
    await complete(again, [], false);
    const offline = (await draft()).lexicalItems;
    expect([offline.state, offline.usedLanguageModel]).toEqual(["DONE", false]);
    expect(offline.items.map((i) => i.status)).toEqual(["PENDING", "APPROVED", "PENDING"]);

    // Editors can remove items.
    expect((await h.gql(DELETE, { loc: localizationId, ids: [offline.items[2]!.id] }, owner())).data).toEqual({
      deleteLexicalItems: 1,
    });
    expect((await draft()).lexicalItems.items.map((i) => i.text)).toEqual(["rely on", "a grain of truth"]);
  });

  it("shows learners approved items once published, and a new draft starts with them", async () => {
    expect(((await h.gql(PUBLIC, { slug: "sky" })).data?.resourceBySlug as unknown) ?? null).toBeNull();
    const d = await draft();
    expect((await h.gql(PUBLISH_NOW, { id: localizationId, v: d.lockVersion }, owner())).errors).toBeUndefined();
    const shown = (await h.gql(PUBLIC, { slug: "sky" })).data?.resourceBySlug as { lexicalItems: object[] };
    expect(shown.lexicalItems).toEqual([
      {
        text: "a grain of truth",
        kind: "IDIOM",
        meaning: "a small part that is true",
        synonyms: ["an element of truth"],
        example: null,
        ieltsTip: null,
        inText: "Some sayings contained a grain of truth.",
      },
    ]);

    expect((await h.gql(START, { id: localizationId }, owner())).errors).toBeUndefined();
    expect((await draft()).lexicalItems.items.map((i) => [i.text, i.status])).toEqual([
      ["rely on", "PENDING"],
      ["a grain of truth", "APPROVED"],
    ]);
    // The published lesson's items are frozen: the database refuses changes to them.
    const refused = await h.t.db
      .execute(
        sql`update lexical_items set meaning = 'changed' where status = 'APPROVED' and revision_id in
          (select published_revision_id from resource_localizations where id = ${localizationId})`
      )
      .then(
        () => null,
        (e: { cause?: { message?: string } }) => e.cause?.message
      );
    expect(refused).toMatch(/immutable/);
  });
});
