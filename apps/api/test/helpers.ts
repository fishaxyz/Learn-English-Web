import { randomBytes } from "node:crypto";
import { schema } from "@english/database";
import { createTestDatabase, type TestDatabase } from "@english/database/testing";
import { createApp } from "../src/app";
import type { SiteRoleValue } from "../src/models";
import { seed } from "../src/seed/seed";
import { testDeps } from "./deps";

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** A migrated throwaway database with site A seeded, an empty site B, and an editor of each role. */
export async function createHarness(overrides: Partial<Parameters<typeof testDeps>[0]> = {}) {
  const t: TestDatabase = await createTestDatabase();
  const a = await seed(t.db, "a.test", "Site A");
  const b = await seed(t.db, "b.test", "Site B");
  const yoga = createApp(testDeps({ db: t.db, ping: () => t.ping(), ...overrides }), {
    corsOrigins: [],
    graphiql: false,
    production: false,
  }).yoga;

  /** A signed-in editor: a user, a membership and a live session token. */
  async function editor(siteId: string, role: SiteRoleValue) {
    const [user] = await t.db
      .insert(schema.users)
      .values({ email: `${role.toLowerCase()}-${randomBytes(4).toString("hex")}@example.invalid` })
      .returning();
    await t.db.insert(schema.siteMemberships).values({ siteId, userId: user!.id, role });
    const token = randomBytes(24).toString("base64url");
    await t.db
      .insert(schema.sessions)
      .values({ sessionToken: token, userId: user!.id, expires: new Date(Date.now() + 3600_000) });
    return { userId: user!.id, token };
  }

  const people = {
    ownerA: await editor(a.siteId, "OWNER"),
    editorA: await editor(a.siteId, "EDITOR"),
    reviewerA: await editor(a.siteId, "REVIEWER"),
    viewerA: await editor(a.siteId, "VIEWER"),
    editorB: await editor(b.siteId, "EDITOR"),
  };

  type Result = {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions?: { code?: string } }[];
  };

  /** Runs one GraphQL operation, as a public visitor of `site` or as a signed-in editor. */
  async function gql(
    query: string,
    variables: Record<string, unknown> = {},
    options: { site?: string; token?: string } = {}
  ): Promise<Result & { status: number }> {
    const res = await yoga.fetch("http://test/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-site-domain": options.site ?? "a.test",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    return { status: res.status, ...((await res.json()) as Result) };
  }

  return { t, a, b, yoga, gql, people, editor, drop: () => t.drop() };
}

export const codeOf = (r: { errors?: { extensions?: { code?: string } }[] }) => r.errors?.[0]?.extensions?.code;
