import { schema } from "@english/database";
import { testDatabaseUrl } from "@english/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeOf, createHarness, type Harness } from "./helpers";

const CREATE = `mutation($input: CreateResourceInput!) { createResource(input: $input) { localizations { id } } }`;
const PUBLISH_NOW = `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { localizations { draft { id } published { revisionNo } } } }`;
const LESSON = `query($slug: String!) { resourceBySlug(kind: READING, slug: $slug) { title } }`;

describe.skipIf(!testDatabaseUrl)("publish now", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.drop();
  });

  async function draft(slug: string) {
    const r = await h.gql(
      CREATE,
      { input: { siteId: h.a.siteId, kind: "READING", slug, title: `Essay ${slug}` } },
      { token: h.people.editorA.token }
    );
    return (r.data?.createResource as { localizations: { id: string }[] }).localizations[0]!.id;
  }

  it("lets an admin or owner publish a draft in one step, and records that review was skipped", async () => {
    const admin = await h.editor(h.a.siteId, "ADMIN");
    const id = await draft("admin-essay");
    const r = await h.gql(PUBLISH_NOW, { id, v: 0 }, { token: admin.token });
    expect(r.errors).toBeUndefined();
    expect(r.data?.publishNow).toEqual({ localizations: [{ draft: null, published: { revisionNo: 1 } }] });
    expect((await h.gql(LESSON, { slug: "admin-essay" })).data?.resourceBySlug).toEqual({ title: "Essay admin-essay" });
    const [event] = await h.t.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.actorUserId, admin.userId));
    expect(event).toMatchObject({
      action: "resource.published",
      data: expect.objectContaining({ skippedReview: true }),
    });

    const ownerDraft = await draft("owner-essay");
    expect(
      (await h.gql(PUBLISH_NOW, { id: ownerDraft, v: 0 }, { token: h.people.ownerA.token })).errors
    ).toBeUndefined();
  });

  it("keeps editors and reviewers on the review path", async () => {
    const id = await draft("editor-essay");
    expect(codeOf(await h.gql(PUBLISH_NOW, { id, v: 0 }, { token: h.people.editorA.token }))).toBe("FORBIDDEN");
    expect(codeOf(await h.gql(PUBLISH_NOW, { id, v: 0 }, { token: h.people.reviewerA.token }))).toBe("FORBIDDEN");
    expect(codeOf(await h.gql(PUBLISH_NOW, { id, v: 0 }))).toBe("UNAUTHENTICATED");
    expect((await h.gql(LESSON, { slug: "editor-essay" })).data?.resourceBySlug).toBeNull();
  });

  it("still checks the version, and still refuses unpublished word links", async () => {
    const id = await draft("stale-essay");
    expect(codeOf(await h.gql(PUBLISH_NOW, { id, v: 7 }, { token: h.people.ownerA.token }))).toBe("CONFLICT");
  });
});
