import { testDatabaseUrl } from "@english/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codeOf, createHarness, type Harness } from "./helpers";

// The New reading page checks a web address while it's typed: free or not, and the first free one like it.
describe.skipIf(!testDatabaseUrl)("web address availability", () => {
  let h: Harness;
  const CHECK = `query($site: ID!, $slug: String!) { slugAvailability(siteId: $site, slug: $slug) { available suggestion } }`;
  beforeAll(async () => {
    h = await createHarness();
    for (const slug of ["morning-chat", "morning-chat-2"]) {
      await h.gql(
        `mutation($input: CreateResourceInput!) { createResource(input: $input) { id } }`,
        { input: { siteId: h.a.siteId, kind: "READING", slug, title: "Chat" } },
        { token: h.people.ownerA.token }
      );
    }
  }, 60_000);
  afterAll(async () => h?.drop());

  it("says whether it's free, and suggests the next free one", async () => {
    const check = async (slug: string, site = h.a.siteId, token = h.people.editorA.token) =>
      h.gql(CHECK, { site, slug }, { token });
    expect((await check("evening-chat")).data?.slugAvailability).toEqual({
      available: true,
      suggestion: "evening-chat",
    });
    expect((await check("morning-chat")).data?.slugAvailability).toEqual({
      available: false,
      suggestion: "morning-chat-3",
    });
    expect((await check("morning-chat-2")).data?.slugAvailability).toEqual({
      available: false,
      suggestion: "morning-chat-3",
    });
    // Another site's addresses are its own; and other sites' editors can't ask.
    expect((await check("morning-chat", h.b.siteId, h.people.editorB.token)).data?.slugAvailability).toMatchObject({
      available: true,
    });
    expect(codeOf(await check("morning-chat", h.a.siteId, h.people.editorB.token))).toBe("NOT_FOUND"); // not their site: not revealed
    expect(codeOf(await check("Not A Slug"))).toBe("VALIDATION_ERROR");
  });
});
