import { schema } from "@english/database";
import { testDatabaseUrl } from "@english/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { annotationsOf, parseRichText, sentenceAround } from "../src/modules/rich-text";
import { codeOf, createHarness, type Harness } from "./helpers";

describe("sentences around a word", () => {
  it("finds the sentence, counting emoji and accents as one character each", () => {
    const text = "Zoë waited. 🚆 Her commute is long! Then she slept.";
    const start = [...text].join("").indexOf("commute");
    const cp = [...text.slice(0, start)].length; // code-point offset
    expect(sentenceAround(text, cp, cp + 7)).toBe("🚆 Her commute is long!");
    expect(sentenceAround('She said, "Trains!" and smiled.', 10, 16)).toBe('She said, "Trains!"');
  });

  it("keeps a key flag on links, and joins adjacent pieces of the same link", () => {
    const doc = parseRichText({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "para-1" },
          content: [
            {
              type: "text",
              text: "rush ",
              marks: [
                { type: "lexical", attrs: { senseRevisionId: "00000000-0000-4000-8000-000000000001", key: true } },
              ],
            },
            {
              type: "text",
              text: "hour",
              marks: [
                { type: "bold" },
                { type: "lexical", attrs: { senseRevisionId: "00000000-0000-4000-8000-000000000001" } },
              ],
            },
          ],
        },
      ],
    });
    expect(annotationsOf(doc)).toEqual([
      {
        blockId: "para-1",
        start: 0,
        end: 9,
        surfaceText: "rush hour",
        senseRevisionId: "00000000-0000-4000-8000-000000000001",
        isKey: true,
      },
    ]);
  });
});

const ITEMS = `query($slug: String!) {
  resourceBySlug(kind: READING, slug: $slug) {
    ... on ReadingResource {
      vocabularyItems {
        isKey
        sense { senseKey entry { displayForm kind } translations { locale text } }
        occurrences { text sentence }
      }
    }
  }
}`;

describe.skipIf(!testDatabaseUrl)("vocabulary items", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.drop();
  });

  it("lists each linked word or structure once, in text order, with key flags, sentences and translations", async () => {
    const r = await h.gql(ITEMS, { slug: "a-morning-commute" });
    const items = (r.data?.resourceBySlug as { vocabularyItems: Record<string, unknown>[] }).vocabularyItems;
    expect(items.map((i) => [(i["sense"] as { senseKey: string }).senseKey, i["isKey"]])).toEqual([
      ["commute-noun", true],
      ["rush-hour-noun", true],
      ["like-verb-ing", false],
      ["bank-noun-river", false],
    ]);
    expect(items[0]).toMatchObject({
      sense: { translations: [{ locale: "vi", text: "quãng đường đi làm (hoặc đi học) hằng ngày" }] },
      occurrences: [{ text: "commute", sentence: "Her commute takes about forty minutes." }],
    });
    // A structure is one item, whole: the pattern, with the words as they appear in the text.
    expect(items[2]).toMatchObject({
      sense: { entry: { displayForm: "like + verb-ing", kind: "SENTENCE_PATTERN" } },
      occurrences: [{ text: "likes watching" }],
    });
  });

  it("saves translations with a sense and validates them", async () => {
    const MANAGE = `mutation($input: ManageLexicalSenseInput!) { manageLexicalSense(input: $input) { id draft { translations { locale text } } } }`;
    const base = {
      siteId: h.a.siteId,
      headword: "platform",
      kind: "WORD",
      partOfSpeech: "noun",
      senseKey: "platform-station",
      definition: "where you get on a train",
    };
    const ok = await h.gql(
      MANAGE,
      { input: { ...base, translations: [{ locale: "vi", text: "sân ga" }] } },
      { token: h.people.editorA.token }
    );
    expect(ok.data?.manageLexicalSense).toMatchObject({ draft: { translations: [{ locale: "vi", text: "sân ga" }] } });
    const bad = await h.gql(
      MANAGE,
      { input: { ...base, senseKey: "platform-2", translations: [{ locale: "Vietnamese", text: "x" }] } },
      { token: h.people.editorA.token }
    );
    expect(codeOf(bad)).toBe("VALIDATION_ERROR");
  });

  it("shows the word bank, drafts included, to the site's editors only", async () => {
    const BANK = `query($site: ID!, $q: String) { editorialSenses(siteId: $site, query: $q) { senseKey draft { id } published { id } } }`;
    const all = await h.gql(BANK, { site: h.a.siteId, q: "plat" }, { token: h.people.viewerA.token });
    expect(all.data?.editorialSenses).toEqual([
      { senseKey: "platform-station", draft: { id: expect.any(String) }, published: null },
    ]);
    expect(codeOf(await h.gql(BANK, { site: h.a.siteId }, { token: h.people.editorB.token }))).toBe("NOT_FOUND");
    expect(codeOf(await h.gql(BANK, { site: h.a.siteId }))).toBe("UNAUTHENTICATED");
    const [sense] = await h.t.db
      .select()
      .from(schema.lexicalSenses)
      .where(eq(schema.lexicalSenses.senseKey, "platform-station"));
    const one = await h.gql(
      `query($id: ID!) { editorialSense(id: $id) { senseKey } }`,
      { id: sense!.id },
      { token: h.people.editorB.token }
    );
    expect(codeOf(one)).toBe("NOT_FOUND");
  });
});
