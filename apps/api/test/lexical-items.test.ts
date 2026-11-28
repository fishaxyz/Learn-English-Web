import { testDatabaseUrl } from "@english/database/testing";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSheet } from "../src/modules/lexical-items/sheet";
import type { RichTextDocument } from "../src/modules/rich-text";
import { codeOf, createHarness, type Harness } from "./helpers";

// A lesson's own lexical vocabulary (ADR 0011): the editor's vocabulary sheet is read into items as written, one
// native language per sheet; editors approve; learners see approved items once published.

const sheetFile = readFileSync(new URL("./fixtures/vanishing-dark.txt", import.meta.url), "utf8");

describe("the vocabulary sheet", () => {
  const items = parseSheet(sheetFile);

  it("reads every item of a real sheet, with its kind from the section", () => {
    expect(items).toHaveLength(30);
    expect(items.map((i) => i.kind)).toEqual([
      ...Array<string>(11).fill("KEYWORD"),
      "PHRASAL_VERB", // rely on (phr v): its part of speech is more exact than the section
      ...Array<string>(5).fill("COLLOCATION"),
      "PHRASAL_VERB",
      "COLLOCATION",
      "COLLOCATION",
      "IDIOM",
      ...Array<string>(3).fill("STRUCTURE"),
      ...Array<string>(6).fill("PARAPHRASE"),
    ]);
  });

  it("keeps a word's parts: meaning, definition, usage, examples and synonyms with their translations, notes", () => {
    expect(items[0]).toEqual({
      text: "disrupt",
      kind: "KEYWORD",
      partOfSpeech: "v",
      pronunciation: "/dɪsˈrʌpt/",
      definition: "to stop something from continuing in its normal way",
      usage: "disrupt + a cycle/routine/service; be seriously disrupted",
      examples: [
        {
          text: "Over the past 150 years, however, that rhythm has been disrupted on an extraordinary scale.",
          translation: "Tuy nhiên, trong 150 năm qua, nhịp điệu đó đã bị phá vỡ ở quy mô phi thường.",
        },
        {
          text: "Online lessons that finish late can disrupt students' sleep patterns.",
          translation: "Những buổi học trực tuyến kết thúc muộn có thể làm xáo trộn giấc ngủ của học sinh.",
        },
      ],
      synonyms: [
        {
          text: "interrupt",
          note: "neutral, usually a short break in an activity",
          translation: "làm gián đoạn tạm thời",
        },
        { text: "upset", note: "less formal, for plans or a balance", translation: "làm đảo lộn" },
      ],
      pairedWith: null,
      question: null,
      language: {
        meaning: "làm gián đoạn, phá vỡ (nhịp, trật tự)",
        definition: null,
        notes: [
          {
            text: "disruption (n) – a situation where things cannot continue normally (sự gián đoạn). Eg: The strike caused widespread disruption to public transport.",
            translation: "Cuộc đình công gây gián đoạn trên diện rộng cho giao thông công cộng.",
          },
        ],
      },
    });
    // Brackets that aren't a part of speech stay in the words.
    expect(items[6]!.synonyms[0]).toEqual({
      text: "contact (with)",
      note: "neutral, physical touch or meeting",
      translation: "sự tiếp xúc",
    });
  });

  it("reads structures (“Use:”) and paraphrase pairs with their question", () => {
    const structure = items[21]!;
    expect([structure.text, structure.definition, structure.language]).toEqual([
      "Only recently have + S + V3",
      "inversion for emphasis in formal writing",
      { meaning: "Chỉ gần đây ... mới ...", definition: "đảo ngữ để nhấn mạnh, văn trang trọng", notes: [] },
    ]);
    const pair = items[24]!;
    expect([pair.text, pair.pairedWith, pair.question, pair.language.meaning]).toEqual([
      "it is difficult to separate the effects of outdoor lighting from those of phones",
      "the difficulty of identifying the exact cause of a health problem",
      "Q2",
      "khó xác định nguyên nhân chính xác",
    ]);
  });

  it("is forgiving: other labels, inline synonyms, a bare section name, bullets, Windows line ends", () => {
    const loose = parseSheet(
      [
        "Idioms",
        "",
        "1) a grain of truth (idiom) - một chút sự thật",
        "a small amount of truth in something",
        "Examples:",
        "- There is a grain of truth in the story.",
        "-> Câu chuyện có một chút sự thật.",
        "Synonyms: an element of truth, a kernel of truth",
        "Notes: more common in Speaking",
        "2. tend to + verb – có xu hướng",
        "3. Rely on",
        "4. rely on",
      ].join("\r\n")
    );
    expect(loose.map((i) => [i.text, i.kind])).toEqual([
      ["a grain of truth", "IDIOM"],
      ["tend to + verb", "IDIOM"], // the section still applies
      ["Rely on", "IDIOM"], // repeats count once
    ]);
    expect(loose[0]).toMatchObject({
      definition: "a small amount of truth in something",
      examples: [{ text: "There is a grain of truth in the story.", translation: "Câu chuyện có một chút sự thật." }],
      synonyms: [
        { text: "an element of truth", note: null, translation: null },
        { text: "a kernel of truth", note: null, translation: null },
      ],
      language: { meaning: "một chút sự thật", notes: [{ text: "more common in Speaking", translation: null }] },
    });
  });

  it("reads a plain list (nothing numbered) as one item per line, a meaning after a spaced dash", () => {
    const plainList = parseSheet("rely on\na grain of truth — một chút sự thật\n\nOnly recently have + S + V3");
    expect(plainList.map((i) => [i.text, i.kind, i.language.meaning])).toEqual([
      ["rely on", "KEYWORD", null],
      ["a grain of truth", "KEYWORD", "một chút sự thật"],
      ["Only recently have + S + V3", "STRUCTURE", null],
    ]);
  });
});

const CREATE = `mutation($input: CreateResourceInput!) { createResource(input: $input) { id localizations { id } } }`;
const FIELDS = `id text kind partOfSpeech pronunciation definition usage pairedWith question
  examples { text inText translations { language text } }
  synonyms { text note translations { language text } }
  languages { language meaning definition notes { text translation } }`;
const STATE = `query($id: ID!) { editorialResource(id: $id) { localizations { draft { lockVersion
  lexicalItems { ${FIELDS} status } } } } }`;
const ADD = `mutation($loc: ID!, $sheet: String!, $language: String!) {
  addLexicalSheet(localizationId: $loc, sheet: $sheet, language: $language) { added updated } }`;
const APPROVE = `mutation($loc: ID!, $items: [LexicalItemApproval!]!) { approveLexicalItems(localizationId: $loc, items: $items) }`;
const DELETE = `mutation($loc: ID!, $ids: [ID!]!) { deleteLexicalItems(localizationId: $loc, ids: $ids) }`;
const PUBLISH_NOW = `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { id } }`;
const START = `mutation($id: ID!) { startDraft(localizationId: $id) { id } }`;
const PUBLIC = `query($slug: String!) { resourceBySlug(kind: READING, slug: $slug) { ... on ReadingResource {
  lexicalItems { ${FIELDS} } } } }`;

const doc = (...paragraphs: string[]): RichTextDocument => ({
  type: "doc",
  content: paragraphs.map((text, i) => ({
    type: "paragraph",
    attrs: { id: `para-${i + 1}` },
    content: [{ type: "text", text }],
  })),
});

type Item = {
  id: string;
  text: string;
  kind: string;
  status: string;
  definition: string | null;
  examples: { text: string; inText: boolean; translations: { language: string; text: string }[] }[];
  synonyms: { text: string; note: string | null; translations: { language: string; text: string }[] }[];
  languages: { language: string; meaning: string | null; notes: { text: string }[] }[];
};

const VI = `A. Vocabulary
1. disrupt (v) /dɪsˈrʌpt/ – làm gián đoạn
to stop something from continuing in its normal way
Example: ...that rhythm has been disrupted on an extraordinary scale.
→ ...nhịp điệu đó đã bị phá vỡ ở quy mô phi thường.
Synonyms:
  interrupt – neutral (làm gián đoạn tạm thời)
Note: disruption (n) – sự gián đoạn

C. Idioms
2. the tip of the iceberg (idiom) – phần nổi của tảng băng
a small, visible part of a much bigger problem`;

const FR = `1. disrupt (v) – perturber
to stop something from continuing in its normal way
Example: ...that rhythm has been disrupted on an extraordinary scale.
→ ...ce rythme a été perturbé à une échelle extraordinaire.
Synonyms:
  interrupt – neutral (interrompre)
2. switch off (phr v) – éteindre`;

describe.skipIf(!testDatabaseUrl)("lexical vocabulary", () => {
  let h: Harness;
  let resourceId: string;
  let localizationId: string;
  beforeAll(async () => {
    h = await createHarness();
  }, 60_000);
  afterAll(async () => h?.drop());

  const owner = () => ({ token: h.people.ownerA.token });
  const viewer = () => ({ token: h.people.viewerA.token });
  const draft = async () =>
    (
      (await h.gql(STATE, { id: resourceId }, owner())).data?.editorialResource as {
        localizations: { draft: { lockVersion: number; lexicalItems: Item[] } | null }[];
      }
    ).localizations[0]!.draft!;
  const add = (sheet: string, language: string, who = owner()) =>
    h.gql(ADD, { loc: localizationId, sheet, language }, who);
  const approve = (items: { id: string; kind: string }[], who = owner()) =>
    h.gql(APPROVE, { loc: localizationId, items }, who);

  it("reads sheets into the lesson, one native language each, and lets editors approve and remove", async () => {
    const created = await h.gql(
      CREATE,
      {
        input: {
          siteId: h.a.siteId,
          kind: "READING",
          slug: "dark",
          title: "The vanishing dark",
          body: doc("For millions of years, that rhythm has been disrupted on an extraordinary scale."),
        },
      },
      owner()
    );
    expect(created.errors).toBeUndefined();
    ({ id: resourceId } = created.data?.createResource as { id: string });
    localizationId = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!.id;

    expect((await draft()).lexicalItems).toEqual([]);
    expect(codeOf(await add(" \n - \n", "vi"))).toBe("VALIDATION_ERROR");
    expect(codeOf(await add(VI, "xx"))).toBe("VALIDATION_ERROR");
    expect(codeOf(await add(VI, "vi", viewer()))).toBe("FORBIDDEN");

    expect((await add(VI, "vi")).data).toEqual({ addLexicalSheet: { added: 2, updated: 0 } });
    const [disrupt, tip] = (await draft()).lexicalItems;
    expect(disrupt).toMatchObject({
      text: "disrupt",
      kind: "KEYWORD",
      status: "DRAFT",
      definition: "to stop something from continuing in its normal way",
      examples: [
        {
          text: "...that rhythm has been disrupted on an extraordinary scale.",
          inText: true, // the sentence is in the script
          translations: [{ language: "vi", text: "...nhịp điệu đó đã bị phá vỡ ở quy mô phi thường." }],
        },
      ],
      synonyms: [
        { text: "interrupt", note: "neutral", translations: [{ language: "vi", text: "làm gián đoạn tạm thời" }] },
      ],
      languages: [{ language: "vi", meaning: "làm gián đoạn", notes: [{ text: "disruption (n) – sự gián đoạn" }] }],
    });
    expect([tip!.text, tip!.kind]).toEqual(["the tip of the iceberg", "IDIOM"]);

    // Approve one; then a French sheet adds French to the same item (sending it back to draft) and a new item.
    expect(codeOf(await approve([{ id: tip!.id, kind: "IDIOM" }], viewer()))).toBe("FORBIDDEN");
    expect((await approve([{ id: disrupt!.id, kind: "KEYWORD" }])).data).toEqual({ approveLexicalItems: 1 });
    expect((await add(FR, "fr")).data).toEqual({ addLexicalSheet: { added: 1, updated: 1 } });
    const [both, , switchOff] = (await draft()).lexicalItems;
    expect(both!.status).toBe("DRAFT");
    expect(both!.examples[0]!.translations).toEqual([
      { language: "vi", text: "...nhịp điệu đó đã bị phá vỡ ở quy mô phi thường." },
      { language: "fr", text: "...ce rythme a été perturbé à une échelle extraordinaire." },
    ]);
    expect(both!.synonyms[0]!.translations.map((t) => t.language)).toEqual(["vi", "fr"]);
    expect(both!.languages.map((l) => [l.language, l.meaning])).toEqual([
      ["vi", "làm gián đoạn"],
      ["fr", "perturber"],
    ]);
    expect([switchOff!.text, switchOff!.kind]).toEqual(["switch off", "PHRASAL_VERB"]);

    // Editors approve (choosing the kind) and remove.
    expect(
      (
        await approve([
          { id: both!.id, kind: "KEYWORD" },
          { id: tip!.id, kind: "IDIOM" },
        ])
      ).data
    ).toEqual({ approveLexicalItems: 2 });
    expect((await h.gql(DELETE, { loc: localizationId, ids: [switchOff!.id] }, owner())).data).toEqual({
      deleteLexicalItems: 1,
    });
    expect((await draft()).lexicalItems.map((i) => [i.text, i.status])).toEqual([
      ["disrupt", "APPROVED"],
      ["the tip of the iceberg", "APPROVED"],
    ]);
  });

  it("shows learners approved items once published, and a new draft starts with them", async () => {
    expect(((await h.gql(PUBLIC, { slug: "dark" })).data?.resourceBySlug as unknown) ?? null).toBeNull();
    const d = await draft();
    expect((await h.gql(PUBLISH_NOW, { id: localizationId, v: d.lockVersion }, owner())).errors).toBeUndefined();
    const shown = (await h.gql(PUBLIC, { slug: "dark" })).data?.resourceBySlug as { lexicalItems: Item[] };
    expect(shown.lexicalItems.map((i) => [i.text, i.languages.map((l) => l.language)])).toEqual([
      ["disrupt", ["vi", "fr"]],
      ["the tip of the iceberg", ["vi"]],
    ]);

    expect((await h.gql(START, { id: localizationId }, owner())).errors).toBeUndefined();
    expect((await draft()).lexicalItems.map((i) => [i.text, i.status])).toEqual([
      ["disrupt", "APPROVED"],
      ["the tip of the iceberg", "APPROVED"],
    ]);
    // The published lesson's items are frozen: the database refuses changes to them.
    const refused = await h.t.db
      .execute(
        sql`update lexical_items set definition = 'changed' where revision_id in
          (select published_revision_id from resource_localizations where id = ${localizationId})`
      )
      .then(
        () => null,
        (e: { cause?: { message?: string } }) => e.cause?.message
      );
    expect(refused).toMatch(/immutable/);
  });
});
