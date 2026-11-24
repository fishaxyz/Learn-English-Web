import "server-only";
import { schema } from "@english/database";
import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { devModeAllowed } from "./dev-mode";
import { serverEnv } from "./env";
import { createSession } from "./password-login";

export const devModeOn = () => devModeAllowed(serverEnv());

/** Invited accounts and their roles, for the development sign-in buttons. Empty when dev mode is off. */
export async function invitedAccounts() {
  if (!devModeOn()) return [];
  const rows = await db()
    .select({ id: schema.users.id, email: schema.users.email, role: schema.siteMemberships.role })
    .from(schema.users)
    .innerJoin(schema.siteMemberships, eq(schema.siteMemberships.userId, schema.users.id))
    .orderBy(asc(schema.users.email));
  const byUser = new Map<string, { id: string; email: string; roles: string[] }>();
  for (const r of rows) {
    const u = byUser.get(r.id) ?? { id: r.id, email: r.email, roles: [] };
    u.roles.push(r.role.toLowerCase());
    byUser.set(r.id, u);
  }
  // Test accounts made by the browser tests are hidden; they'd crowd out real ones.
  return [...byUser.values()].filter((u) => !/^e2e-.*@example\.test$/.test(u.email));
}

/** Signs in as an invited user. Refuses unless dev mode is on, checked here again, not only on the page. */
export async function devSignIn(userId: string) {
  if (!devModeOn()) return null;
  const [user] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.siteMemberships, eq(schema.siteMemberships.userId, schema.users.id))
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return null;
  const session = await createSession(user.id);
  await db().insert(schema.auditEvents).values({
    siteId: null,
    actorUserId: user.id,
    action: "dev.signed_in",
    entityType: "user",
    entityId: user.id,
  });
  return session;
}
