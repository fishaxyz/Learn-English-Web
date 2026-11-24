import { schema } from "@english/database";
import { testDatabaseUrl } from "@english/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDeps } from "./deps";
import { codeOf, createHarness, type Harness } from "./helpers";

const LIST = `query List($filter: ResourceFilter, $first: Int!, $after: String) {
  publishedResources(filter: $filter, first: $first, after: $after) {
    nodes { id kind slug title revisionNo topics { slug } }
    pageInfo { endCursor hasNextPage }
  }
}`;

const BY_SLUG = `query Lesson($kind: ResourceKind!, $slug: String!) {
  resourceBySlug(kind: $kind, slug: $slug) {
    __typename id title revisionNo
    ... on ReadingResource { wordCount estimatedReadingSeconds examLabels { code } }
    ... on LexicalCollectionResource { items { senseKey definition revisionId } }
    exerciseSets {
      id title
      questions {
        __typename id
        ... on SingleChoiceQuestion { stem options { id content } }
        ... on TrueFalseNotGivenQuestion { statement }
        ... on GapFillQuestion { segments { ... on TextSegment { text } ... on GapSegment { gapId } } }
      }
    }
  }
}`;

const EDITORIAL = `fragment R on EditorialResource {
  id localizations { id slug draft { id status title lockVersion } published { id revisionNo title } }
}`;

const GRADE = `mutation Grade($input: GradePracticeInput!) {
  gradePractice(input: $input) {
    score maxScore
    questions { questionId correct awardedPoints explanation
      correctAnswer { __typename ... on ChoiceAnswer { optionId } ... on JudgementAnswer { judgement } ... on GapsAnswer { gaps { gapId text } } }
    }
  }
}`;

type Lesson = {
  id: string;
  title: string;
  revisionNo: number;
  exerciseSets: {
    id: string;
    questions: { __typename: string; id: string; options?: { id: string; content: string }[] }[];
  }[];
  items?: { senseKey: string; definition: string; revisionId: string }[];
};

describe.skipIf(!testDatabaseUrl)("Phase 1 API", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.drop();
  });

  const lesson = async (kind: string, slug: string, site = "a.test") =>
    (await h.gql(BY_SLUG, { kind, slug }, { site })).data?.resourceBySlug as Lesson | null;

  describe("public content", () => {
    it("lists a site's published lessons, newest first, with cursor pages", async () => {
      const page1 = await h.gql(LIST, { first: 2 });
      const list = page1.data?.publishedResources as {
        nodes: { slug: string }[];
        pageInfo: { endCursor: string; hasNextPage: boolean };
      };
      expect(list.nodes.map((n) => n.slug)).toEqual(["words-for-getting-to-work", "running-late"]);
      expect(list.pageInfo.hasNextPage).toBe(true);
      const page2 = await h.gql(LIST, { first: 2, after: list.pageInfo.endCursor });
      const rest = page2.data?.publishedResources as { nodes: { slug: string }[]; pageInfo: { hasNextPage: boolean } };
      expect(rest.nodes.map((n) => n.slug)).toEqual(["a-morning-commute"]);
      expect(rest.pageInfo.hasNextPage).toBe(false);
    });

    it("filters by kind, topic and full-text search", async () => {
      const byKind = await h.gql(LIST, { first: 10, filter: { kind: "LISTENING" } });
      expect((byKind.data?.publishedResources as { nodes: { slug: string }[] }).nodes.map((n) => n.slug)).toEqual([
        "running-late",
      ]);
      const byTopic = await h.gql(LIST, { first: 10, filter: { topicSlug: "work" } });
      expect((byTopic.data?.publishedResources as { nodes: unknown[] }).nodes).toHaveLength(2);
      const bySearch = await h.gql(LIST, { first: 10, filter: { search: "manager smiled" } });
      expect((bySearch.data?.publishedResources as { nodes: { slug: string }[] }).nodes.map((n) => n.slug)).toEqual([
        "a-morning-commute",
      ]);
    });

    it("caps page size at 50", async () => {
      expect(codeOf(await h.gql(LIST, { first: 51 }))).toBe("VALIDATION_ERROR");
    });

    it("returns reading details computed from the text", async () => {
      const reading = (await lesson("READING", "a-morning-commute")) as Lesson & {
        wordCount: number;
        estimatedReadingSeconds: number;
        examLabels: { code: string }[];
      };
      expect(reading.wordCount).toBeGreaterThan(100);
      expect(reading.estimatedReadingSeconds).toBe(Math.ceil((reading.wordCount / 200) * 60));
      expect(reading.examLabels).toEqual([{ code: "IELTS" }]);
    });
  });

  describe("site isolation", () => {
    it("never shows one site's lessons on another", async () => {
      const onB = await h.gql(LIST, { first: 10 }, { site: "b.test" });
      const slugsB = (onB.data?.publishedResources as { nodes: { id: string }[] }).nodes.map((n) => n.id);
      const onA = await h.gql(LIST, { first: 10 });
      const slugsA = (onA.data?.publishedResources as { nodes: { id: string }[] }).nodes.map((n) => n.id);
      expect(slugsA).toHaveLength(3);
      expect(slugsB).toHaveLength(3); // B has its own copies of the sample lessons...
      expect(slugsA.filter((id) => slugsB.includes(id))).toEqual([]); // ...and none of them are A's
    });

    it("won't grade site A's exercises as site B", async () => {
      const reading = await lesson("READING", "a-morning-commute");
      const r = await h.gql(
        GRADE,
        { input: { exerciseSetId: reading!.exerciseSets[0]!.id, answers: [] } },
        { site: "b.test" }
      );
      expect(codeOf(r)).toBe("NOT_FOUND");
    });

    it("an editor of site B can't touch site A's lessons", async () => {
      const loc = await h.t.db
        .select()
        .from(schema.resourceLocalizations)
        .where(eq(schema.resourceLocalizations.siteId, h.a.siteId));
      const r = await h.gql(
        `mutation($id: ID!) { startDraft(localizationId: $id) { id } }`,
        { id: loc[0]!.id },
        { token: h.people.editorB.token }
      );
      expect(codeOf(r)).toBe("NOT_FOUND");
    });

    it("an unknown site is NOT_FOUND", async () => {
      expect(codeOf(await h.gql(LIST, { first: 5 }, { site: "nowhere.test" }))).toBe("NOT_FOUND");
    });
  });

  describe("drafts and publishing", () => {
    const CREATE = `${EDITORIAL} mutation($input: CreateResourceInput!) { createResource(input: $input) { ...R } }`;

    it("keeps a new draft private until a reviewer publishes it", async () => {
      const created = await h.gql(
        CREATE,
        {
          input: {
            siteId: h.a.siteId,
            kind: "ARTICLE",
            slug: "secret-draft",
            title: "Not ready yet",
            topicSlugs: ["work"],
            body: {
              type: "doc",
              content: [
                { type: "paragraph", attrs: { id: "para-1" }, content: [{ type: "text", text: "Draft text." }] },
              ],
            },
          },
        },
        { token: h.people.editorA.token }
      );
      expect(created.errors).toBeUndefined();
      const loc = (created.data?.createResource as { localizations: { id: string; draft: { lockVersion: number } }[] })
        .localizations[0]!;
      expect(await lesson("ARTICLE", "secret-draft")).toBeNull();

      // The editor can't publish; they submit, and the reviewer publishes.
      const editorPublish = await h.gql(
        `mutation($id: ID!) { publishResource(localizationId: $id, lockVersion: 0) { id } }`,
        { id: loc.id },
        { token: h.people.editorA.token }
      );
      expect(codeOf(editorPublish)).toBe("FORBIDDEN");
      const submitted = await h.gql(
        `mutation($id: ID!) { submitForReview(localizationId: $id, lockVersion: 0) { id } }`,
        { id: loc.id },
        { token: h.people.editorA.token }
      );
      expect(submitted.errors).toBeUndefined();
      expect(await lesson("ARTICLE", "secret-draft")).toBeNull(); // in review is still private
      const published = await h.gql(
        `mutation($id: ID!) { publishResource(localizationId: $id, lockVersion: 1) { id } }`,
        { id: loc.id },
        { token: h.people.reviewerA.token }
      );
      expect(published.errors).toBeUndefined();
      expect((await lesson("ARTICLE", "secret-draft"))?.title).toBe("Not ready yet");
    });

    it("editing a new draft never changes the live lesson, and publishing it supersedes the old one", async () => {
      const [loc] = await h.t.db
        .select()
        .from(schema.resourceLocalizations)
        .where(eq(schema.resourceLocalizations.slug, "a-morning-commute"));
      const localizationId = loc!.id;
      const before = await lesson("READING", "a-morning-commute");
      const oldQuestionIds = before!.exerciseSets[0]!.questions.map((q) => q.id);

      const started = await h.gql(
        `mutation($id: ID!) { startDraft(localizationId: $id) { id } }`,
        { id: localizationId },
        { token: h.people.editorA.token }
      );
      expect(started.errors).toBeUndefined();
      const updated = await h.gql(
        `mutation($input: UpdateDraftInput!) { updateDraft(input: $input) { id } }`,
        { input: { localizationId, lockVersion: 0, title: "A Morning Commute (updated)" } },
        { token: h.people.editorA.token }
      );
      expect(updated.errors).toBeUndefined();

      // Live lesson unchanged: same title, same revision, same questions.
      const during = await lesson("READING", "a-morning-commute");
      expect(during?.title).toBe("A Morning Commute");
      expect(during?.exerciseSets[0]!.questions.map((q) => q.id)).toEqual(oldQuestionIds);

      // A stale lockVersion is a conflict, not a silent overwrite.
      const stale = await h.gql(
        `mutation($input: UpdateDraftInput!) { updateDraft(input: $input) { id } }`,
        { input: { localizationId, lockVersion: 0, title: "Overwrite" } },
        { token: h.people.editorA.token }
      );
      expect(codeOf(stale)).toBe("CONFLICT");

      await h.gql(
        `mutation($id: ID!) { submitForReview(localizationId: $id, lockVersion: 1) { id } }`,
        { id: localizationId },
        { token: h.people.editorA.token }
      );
      const pub = await h.gql(
        `mutation($id: ID!) { publishResource(localizationId: $id, lockVersion: 2) { id } }`,
        { id: localizationId },
        { token: h.people.reviewerA.token }
      );
      expect(pub.errors).toBeUndefined();

      const after = await lesson("READING", "a-morning-commute");
      expect(after?.title).toBe("A Morning Commute (updated)");
      expect(after?.revisionNo).toBe(2);
      // The new revision has its own copies of the exercises.
      expect(after?.exerciseSets[0]!.questions.map((q) => q.id)).not.toEqual(oldQuestionIds);
      const statuses = await h.t.db
        .select({ no: schema.resourceRevisions.revisionNo, status: schema.resourceRevisions.status })
        .from(schema.resourceRevisions)
        .where(eq(schema.resourceRevisions.localizationId, localizationId));
      expect(statuses.sort((x, y) => x.no - y.no)).toEqual([
        { no: 1, status: "SUPERSEDED" },
        { no: 2, status: "PUBLISHED" },
      ]);
      const audits = await h.t.db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.action, "resource.published"));
      expect(audits.some((e) => e.actorUserId === h.people.reviewerA.userId)).toBe(true);
    });

    it("checks roles and sign-in on every editorial action", async () => {
      const input = { siteId: h.a.siteId, kind: "ARTICLE", slug: "nope", title: "Nope" };
      expect(codeOf(await h.gql(CREATE, { input }))).toBe("UNAUTHENTICATED");
      expect(codeOf(await h.gql(CREATE, { input }, { token: h.people.viewerA.token }))).toBe("FORBIDDEN");
      expect(codeOf(await h.gql(CREATE, { input }, { token: "not-a-real-session-token-xyz" }))).toBe("UNAUTHENTICATED");
      // A siteId the editor isn't a member of looks like it doesn't exist.
      expect(codeOf(await h.gql(CREATE, { input }, { token: h.people.editorB.token }))).toBe("NOT_FOUND");
    });

    it("rejects unsafe or unknown rich text", async () => {
      const make = (body: unknown) =>
        h.gql(
          CREATE,
          {
            input: {
              siteId: h.a.siteId,
              kind: "ARTICLE",
              slug: `x-${Math.random().toString(36).slice(2, 8)}`,
              title: "X",
              body,
            },
          },
          { token: h.people.editorA.token }
        );
      const jsLink = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: "para-1" },
            content: [
              { type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
            ],
          },
        ],
      };
      expect(codeOf(await make(jsLink))).toBe("VALIDATION_ERROR");
      expect(codeOf(await make({ type: "doc", content: [{ type: "html", attrs: { id: "para-1" } }] }))).toBe(
        "VALIDATION_ERROR"
      );
      expect(codeOf(await make({ type: "doc", content: [{ type: "paragraph", content: [] }] }))).toBe(
        "VALIDATION_ERROR"
      ); // no block id
    });
  });

  describe("exercises and grading", () => {
    it("never sends answer keys with the questions", async () => {
      const reading = await lesson("READING", "a-morning-commute");
      const text = JSON.stringify(reading);
      expect(text).not.toMatch(/correctOption|accepted|"answer"|NOT_GIVEN|grading/);
      // Nor can a client ask for them: no question type has such a field.
      const introspection = await h.gql(`{ __type(name: "SingleChoiceQuestion") { fields { name } } }`);
      const fields = (introspection.data?.__type as { fields: { name: string }[] }).fields.map((f) => f.name);
      expect(fields.sort()).toEqual(["id", "options", "points", "position", "stem", "type"]);
    });

    it("grades on the server, with deterministic answer matching", async () => {
      const reading = await lesson("READING", "a-morning-commute");
      const set = reading!.exerciseSets[0]!;
      const [tfMia, tfManager, tfCat, choice, gap] = set.questions;
      const busy = choice!.options!.find((o) => o.content === "The train is very busy.")!;
      const r = await h.gql(GRADE, {
        input: {
          exerciseSetId: set.id,
          answers: [
            { questionId: tfMia!.id, judgement: "FALSE" },
            { questionId: tfManager!.id, judgement: "TRUE" }, // wrong
            { questionId: tfCat!.id, judgement: "NOT_GIVEN" },
            { questionId: choice!.id, optionId: busy.id },
            { questionId: gap!.id, gaps: [{ gapId: "time", text: "  Forty " }] }, // case and spaces don't matter
          ],
        },
      });
      expect(r.errors).toBeUndefined();
      const result = r.data?.gradePractice as { score: number; maxScore: number; questions: { correct: boolean }[] };
      expect(result.score).toBe(4);
      expect(result.maxScore).toBe(5);
      expect(result.questions.map((q) => q.correct)).toEqual([true, false, true, true, true]);
    });

    it("doesn't accept near-misses, and refuses answers to other sets' questions", async () => {
      const reading = await lesson("READING", "a-morning-commute");
      const set = reading!.exerciseSets[0]!;
      const gap = set.questions[4]!;
      const r = await h.gql(GRADE, {
        input: { exerciseSetId: set.id, answers: [{ questionId: gap.id, gaps: [{ gapId: "time", text: "fourty" }] }] },
      });
      expect((r.data?.gradePractice as { score: number }).score).toBe(0);
      const listening = await lesson("LISTENING", "running-late");
      const foreign = listening!.exerciseSets[0]!.questions[0]!;
      expect(
        codeOf(
          await h.gql(GRADE, {
            input: { exerciseSetId: set.id, answers: [{ questionId: foreign.id, judgement: "TRUE" }] },
          })
        )
      ).toBe("VALIDATION_ERROR");
    });

    it("won't grade a draft's exercises", async () => {
      const [draftSet] = await h.t.db
        .select({ id: schema.exerciseSets.id })
        .from(schema.exerciseSets)
        .innerJoin(schema.resourceRevisions, eq(schema.resourceRevisions.id, schema.exerciseSets.revisionId))
        .where(eq(schema.resourceRevisions.status, "SUPERSEDED"));
      expect(codeOf(await h.gql(GRADE, { input: { exerciseSetId: draftSet!.id, answers: [] } }))).toBe("NOT_FOUND");
    });
  });

  describe("lexicon", () => {
    const SEARCH = `query($q: String!) { lexicalSearch(query: $q) { displayForm senses { senseKey definition } } }`;

    it("finds exact, prefix and fuzzy matches, keeping homograph senses apart", async () => {
      const bank = (await h.gql(SEARCH, { q: "Bank" })).data?.lexicalSearch as {
        displayForm: string;
        senses: { senseKey: string }[];
      }[];
      expect(bank[0]!.displayForm).toBe("bank");
      expect(bank[0]!.senses.map((s) => s.senseKey).sort()).toEqual(["bank-noun-money", "bank-noun-river"]);
      const fuzzy = (await h.gql(SEARCH, { q: "comute" })).data?.lexicalSearch as { displayForm: string }[];
      expect(fuzzy.map((e) => e.displayForm)).toContain("commute");
      const prefix = (await h.gql(SEARCH, { q: "rush" })).data?.lexicalSearch as { displayForm: string }[];
      expect(prefix.map((e) => e.displayForm)).toContain("rush hour");
    });

    it("hides draft-only senses, and keeps collections pinned to the revision they published with", async () => {
      const MANAGE = `mutation($input: ManageLexicalSenseInput!) { manageLexicalSense(input: $input) { id draft { lockVersion } } }`;
      // A brand-new, unpublished word: not searchable.
      await h.gql(
        MANAGE,
        {
          input: {
            siteId: h.a.siteId,
            headword: "zebra crossing",
            kind: "COLLOCATION",
            partOfSpeech: "noun",
            senseKey: "zebra-crossing",
            definition: "a place to cross the road",
          },
        },
        { token: h.people.editorA.token }
      );
      expect((await h.gql(SEARCH, { q: "zebra crossing" })).data?.lexicalSearch).toEqual([]);

      // Publish a new definition of "commute".
      const [sense] = await h.t.db
        .select()
        .from(schema.lexicalSenses)
        .where(eq(schema.lexicalSenses.senseKey, "commute-noun"))
        .limit(1);
      const before = await lesson("LEXICAL_COLLECTION", "words-for-getting-to-work");
      const edited = await h.gql(
        MANAGE,
        {
          input: {
            siteId: h.a.siteId,
            senseId: sense!.id,
            partOfSpeech: "noun",
            senseKey: "commute-noun",
            definition: "the regular journey between home and work",
          },
        },
        { token: h.people.editorA.token }
      );
      expect(edited.errors).toBeUndefined();
      const pub = await h.gql(
        `mutation($id: ID!) { publishLexicalSense(senseId: $id, lockVersion: 0) { id } }`,
        { id: sense!.id },
        { token: h.people.reviewerA.token }
      );
      expect(pub.errors).toBeUndefined();

      // Search shows the new definition; the published collection still shows the one it pinned.
      const search = (await h.gql(SEARCH, { q: "commute" })).data?.lexicalSearch as {
        senses: { definition: string }[];
      }[];
      expect(search[0]!.senses[0]!.definition).toBe("the regular journey between home and work");
      const after = await lesson("LEXICAL_COLLECTION", "words-for-getting-to-work");
      expect(after?.items).toEqual(before?.items);
    });
  });

  describe("request limits", () => {
    it("rejects queries nested too deeply", async () => {
      const deep = `{ publishedResources(first: 1) { nodes { exerciseSets { questions { ... on SingleChoiceQuestion { options { id } } } } } } }`;
      expect((await h.gql(deep)).errors).toBeUndefined(); // a normal query is fine
      const tooDeep = `fragment F on LexicalSense { entry { senses { entry { senses { entry { senses { entry { senses { id } } } } } } } } }
        { lexicalSearch(query: "bank") { senses { ...F } } }`;
      expect(codeOf(await h.gql(tooDeep))).toBe("VALIDATION_ERROR");
    });

    it("rejects too many aliases", async () => {
      const aliases = Array.from({ length: 21 }, (_, i) => `t${i}: topics { id }`).join(" ");
      expect(codeOf(await h.gql(`{ ${aliases} }`))).toBe("VALIDATION_ERROR");
    });

    it("rejects large request bodies before parsing them", async () => {
      const { createApp } = await import("../src/app");
      const { handler } = createApp(testDeps({ db: h.t.db, ping: () => h.t.ping() }), {
        corsOrigins: [],
        graphiql: false,
        production: false,
      });
      const { createServer } = await import("node:http");
      const server = createServer(handler).listen(0);
      const port = (server.address() as { port: number }).port;
      const big = JSON.stringify({ query: `{ health { status } }`, padding: "x".repeat(200_000) });
      const res = await fetch(`http://127.0.0.1:${port}/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: big,
      });
      server.close();
      expect(res.status).toBe(413);
    });
  });
});
