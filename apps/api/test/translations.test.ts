import { testDatabaseUrl } from "@english/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sentencesOf, type RichTextDocument } from "../src/modules/rich-text";
import { codeOf, createHarness, type Harness } from "./helpers";

// Sentence translations (ADR 0009): an editor asks for a language, the worker (this test) sends back one
// translation per sentence, editors approve them (with edits), and learners see approved ones once published.
// When the script changes, changed sentences are translated again automatically. No language model is called.

const CREATE = `mutation($input: CreateResourceInput!) { createResource(input: $input) { id localizations { id } } }`;
const CLAIM = `mutation { claimJob(types: ["translations.translate"]) { id payload claimToken } }`;
const COMPLETE = `mutation($job: ID!, $token: String!, $result: JobPayload!) { completeJob(jobId: $job, claimToken: $token, result: $result) }`;
const STATE = `query($id: ID!, $locale: String!) { editorialResource(id: $id) { localizations { draft { lockVersion
  translations(locale: $locale) { state usedLanguageModel sentences { blockId start end source translation { id text status } } } } } } }`;
const TRANSLATE = `mutation($loc: ID!, $locale: String!, $redo: Boolean) { translateDraft(localizationId: $loc, locale: $locale, redoDrafts: $redo) }`;
const APPROVE = `mutation($loc: ID!, $items: [TranslationApproval!]!) { approveTranslations(localizationId: $loc, items: $items) }`;
const UPDATE = `mutation($input: UpdateDraftInput!) { updateDraft(input: $input) { id } }`;
const PUBLISH_NOW = `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { id } }`;
const PUBLIC = `query($slug: String!) { resourceBySlug(kind: READING, slug: $slug) { ... on ReadingResource { translations { locale blockId start end text } } } }`;

const doc = (...paragraphs: string[]): RichTextDocument => ({
  type: "doc",
  content: paragraphs.map((text, i) => ({
    type: "paragraph",
    attrs: { id: `para-${i + 1}` },
    content: [{ type: "text", text }],
  })),
});

describe("sentences", () => {
  it("are split like the website splits them, in code points, closing quotes included", () => {
    const text = "Zoë 🚆 left. “Why?” she asked… Fine";
    const spans = sentencesOf(text);
    expect(spans.map((s) => [...text].slice(s.start, s.end).join(""))).toEqual([
      "Zoë 🚆 left.",
      "“Why?”",
      "she asked…",
      "Fine",
    ]);
    expect(spans[0]).toEqual({ start: 0, end: 11 });
  });
});

type Sentence = {
  blockId: string;
  start: number;
  end: number;
  source: string;
  translation: { id: string; text: string; status: string } | null;
};
type Job = {
  id: string;
  claimToken: string;
  payload: {
    locale: string;
    paragraphs: { blockId: string; sentences: { start: number; end: number; text: string }[] }[];
  };
};

describe.skipIf(!testDatabaseUrl)("sentence translations", () => {
  let h: Harness;
  let resourceId: string;
  let localizationId: string;
  beforeAll(async () => {
    h = await createHarness();
  }, 60_000);
  afterAll(async () => h?.drop());

  const owner = () => ({ token: h.people.ownerA.token });
  const draft = async (locale = "vi") =>
    (
      (await h.gql(STATE, { id: resourceId, locale }, owner())).data?.editorialResource as {
        localizations: {
          draft: {
            lockVersion: number;
            translations: { state: string; usedLanguageModel: boolean | null; sentences: Sentence[] };
          };
        }[];
      }
    ).localizations[0]!.draft;
  const claim = async () => (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as Job | null;
  const complete = (job: Job, items: { blockId: string; start: number; text: string }[], ai = true) =>
    h.gql(COMPLETE, { job: job.id, token: job.claimToken, result: { ai, items } }, { worker: true });

  it("translates on request, keeps only sentences that are really there, and lets editors approve with edits", async () => {
    const created = await h.gql(
      CREATE,
      {
        input: {
          siteId: h.a.siteId,
          kind: "READING",
          slug: "bilingual",
          title: "Bilingual",
          body: doc("Her commute is long. She reads on the train.", "It takes an hour."),
        },
      },
      owner()
    );
    expect(created.errors).toBeUndefined();
    ({ id: resourceId } = created.data?.createResource as { id: string });
    localizationId = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!.id;

    // Nothing happens until an editor asks; only Vietnamese, French and German.
    expect((await draft()).translations.state).toBe("IDLE");
    expect(codeOf(await h.gql(TRANSLATE, { loc: localizationId, locale: "es" }, owner()))).toBe("VALIDATION_ERROR");
    expect((await h.gql(TRANSLATE, { loc: localizationId, locale: "vi" }, owner())).data).toEqual({
      translateDraft: true,
    });
    expect((await draft()).translations.state).toBe("WORKING");
    expect(codeOf(await h.gql(TRANSLATE, { loc: localizationId, locale: "vi" }, owner()))).toBe("CONFLICT");

    const job = (await claim())!;
    expect(job.payload.locale).toBe("vi");
    expect(job.payload.paragraphs).toEqual([
      {
        blockId: "para-1",
        sentences: [
          { start: 0, end: 20, text: "Her commute is long." },
          { start: 21, end: 44, text: "She reads on the train." },
        ],
      },
      { blockId: "para-2", sentences: [{ start: 0, end: 17, text: "It takes an hour." }] },
    ]);
    const done = await complete(job, [
      { blockId: "para-1", start: 0, text: "Quãng đường đi làm của cô ấy dài." },
      { blockId: "para-1", start: 21, text: "Cô ấy  đọc sách trên tàu. " },
      { blockId: "para-2", start: 0, text: "Mất một tiếng." },
      { blockId: "para-2", start: 5, text: "Not a sentence start: dropped" },
      { blockId: "para-9", start: 0, text: "No such paragraph: dropped" },
    ]);
    expect(done.errors).toBeUndefined();

    const t = (await draft()).translations;
    expect(t.state).toBe("DONE");
    expect(t.usedLanguageModel).toBe(true);
    expect(t.sentences.map((s) => [s.source, s.translation?.text, s.translation?.status])).toEqual([
      ["Her commute is long.", "Quãng đường đi làm của cô ấy dài.", "DRAFT"],
      ["She reads on the train.", "Cô ấy đọc sách trên tàu.", "DRAFT"], // spaces tidied
      ["It takes an hour.", "Mất một tiếng.", "DRAFT"],
    ]);

    // Editors approve, with their own wording; viewers can't; empty text isn't allowed.
    const [first, second] = t.sentences;
    expect(
      codeOf(
        await h.gql(
          APPROVE,
          { loc: localizationId, items: [{ id: first!.translation!.id, text: "x" }] },
          { token: h.people.viewerA.token }
        )
      )
    ).toBe("FORBIDDEN");
    expect(
      codeOf(
        await h.gql(APPROVE, { loc: localizationId, items: [{ id: first!.translation!.id, text: "  " }] }, owner())
      )
    ).toBe("VALIDATION_ERROR");
    const approved = await h.gql(
      APPROVE,
      {
        loc: localizationId,
        items: [
          { id: first!.translation!.id, text: "Quãng đường đi làm của cô ấy rất dài." },
          { id: second!.translation!.id, text: second!.translation!.text },
        ],
      },
      owner()
    );
    expect(approved.data).toEqual({ approveTranslations: 2 });
    expect((await draft()).translations.sentences.map((s) => s.translation?.status)).toEqual([
      "APPROVED",
      "APPROVED",
      "DRAFT",
    ]);
  });

  it("follows the script: unchanged sentences keep theirs, changed ones are translated again on save", async () => {
    // Text added before the first sentence moves it; the second sentence changes; the third stays.
    const d = await draft();
    const saved = await h.gql(
      UPDATE,
      {
        input: {
          localizationId,
          lockVersion: d.lockVersion,
          body: doc("Every day, her commute is long. She reads on the train.", "It takes an hour."),
        },
      },
      owner()
    );
    expect(saved.errors).toBeUndefined();
    const after = (await draft()).translations;
    expect(after.state).toBe("WORKING"); // queued by the save, no button needed
    expect(after.sentences.map((s) => [s.source, s.start, s.translation?.text ?? null])).toEqual([
      ["Every day, her commute is long.", 0, null],
      ["She reads on the train.", 32, "Cô ấy đọc sách trên tàu."], // kept, at its new place
      ["It takes an hour.", 0, "Mất một tiếng."],
    ]);

    const job = (await claim())!;
    // The worker gets the paragraph with the new sentence (all of it, for context) and nothing else.
    expect(job.payload.paragraphs.map((p) => p.blockId)).toEqual(["para-1"]);
    await complete(job, [
      { blockId: "para-1", start: 0, text: "Mỗi ngày, quãng đường đi làm của cô ấy rất dài." },
      { blockId: "para-1", start: 32, text: "Would overwrite the approved one: ignored" },
    ]);
    const now = (await draft()).translations.sentences;
    expect(now.map((s) => [s.translation?.text, s.translation?.status])).toEqual([
      ["Mỗi ngày, quãng đường đi làm của cô ấy rất dài.", "DRAFT"],
      ["Cô ấy đọc sách trên tàu.", "APPROVED"],
      ["Mất một tiếng.", "DRAFT"],
    ]);

    // Without the local AI, the job finishes with nothing and says so.
    await h.gql(TRANSLATE, { loc: localizationId, locale: "fr" }, owner());
    await complete((await claim())!, [], false);
    const fr = (await draft("fr")).translations;
    expect([fr.state, fr.usedLanguageModel, fr.sentences.every((s) => !s.translation)]).toEqual(["DONE", false, true]);
  });

  it("shows learners only approved translations, and only once published", async () => {
    expect(((await h.gql(PUBLIC, { slug: "bilingual" })).data?.resourceBySlug as unknown) ?? null).toBeNull(); // not published yet
    const d = await draft();
    expect((await h.gql(PUBLISH_NOW, { id: localizationId, v: d.lockVersion }, owner())).errors).toBeUndefined();
    const shown = (await h.gql(PUBLIC, { slug: "bilingual" })).data?.resourceBySlug as {
      translations: { locale: string; blockId: string; start: number; end: number; text: string }[];
    };
    expect(shown.translations).toEqual([
      { locale: "vi", blockId: "para-1", start: 32, end: 55, text: "Cô ấy đọc sách trên tàu." },
    ]);
  });
});
