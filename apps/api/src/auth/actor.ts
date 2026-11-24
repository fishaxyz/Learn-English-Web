import { schema, type Database } from "@english/database";
import { and, eq, gt } from "drizzle-orm";
import { AppError } from "../errors";
import type { MembershipModel, ViewerModel } from "../models";
import { can, type Permission } from "./permissions";

export type Actor = { user: ViewerModel; memberships: MembershipModel[] };

/**
 * The editor behind a request, from `Authorization: Bearer <session token>`. The dashboard's server forwards
 * the Auth.js session token; browsers never call the API with it directly. Bearer tokens (not cookies) mean
 * the API isn't exposed to CSRF. An unknown or expired token is simply "not signed in".
 */
export async function resolveActor(db: Database, authorization: string | null): Promise<Actor | null> {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9._~+/=-]{16,512})$/)?.[1];
  if (!token) return null;
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.sessionToken, token), gt(schema.sessions.expires, new Date())))
    .limit(1);
  if (!row) return null;
  const memberships = await db
    .select({ siteId: schema.siteMemberships.siteId, role: schema.siteMemberships.role })
    .from(schema.siteMemberships)
    .where(eq(schema.siteMemberships.userId, row.user.id));
  return { user: row.user, memberships };
}

/** Throws unless the actor holds a role on the site that grants the permission. Never trusts a client's role. */
export function authorize(actor: Actor | null, siteId: string, permission: Permission): Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Sign in first");
  const role = actor.memberships.find((m) => m.siteId === siteId)?.role;
  // Not a member: the same answer as "doesn't exist", so site ids can't be probed.
  if (!role) throw new AppError("NOT_FOUND", "Not found");
  if (!can(role, permission)) throw new AppError("FORBIDDEN", "Your role on this site can't do that");
  return actor;
}
