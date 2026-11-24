import "server-only";
import { randomBytes } from "node:crypto";
import { schema } from "@english/database";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { afterFailure, dummyHash, hashPassword, passwordProblem, verifyPassword } from "./passwords";

/** Same lifetime as Auth.js's sessions (auth.ts), so both ways of signing in behave alike. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Auth.js's cookie name: the __Secure- prefix over HTTPS. Our sessions are the same database sessions. */
export const sessionCookieName = (secure: boolean) =>
  secure ? "__Secure-authjs.session-token" : "authjs.session-token";

/** A database session, exactly like the ones Auth.js creates for an email link. */
export async function createSession(userId: string, now = new Date()) {
  const sessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await db().insert(schema.sessions).values({ sessionToken, userId, expires });
  return { sessionToken, expires };
}

export type LoginResult = { ok: true; sessionToken: string; expires: Date } | { ok: false; reason: "wrong" | "locked" };

/** The invited user with this email (any role on any site), with their password row if they set one. */
async function findInvited(email: string) {
  const [row] = await db()
    .select({ user: schema.users, password: schema.userPasswords })
    .from(schema.users)
    .innerJoin(schema.siteMemberships, eq(schema.siteMemberships.userId, schema.users.id))
    .leftJoin(schema.userPasswords, eq(schema.userPasswords.userId, schema.users.id))
    .where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/**
 * Checks an email and password. Every failure looks the same to the person ("wrong"), whether the email is
 * unknown, has no password, or the password is wrong, and takes about as long; only a lockout is reported.
 * On success, creates a database session exactly like an email-link sign-in does.
 */
export async function loginWithPassword(email: string, password: string, now = new Date()): Promise<LoginResult> {
  const row = await findInvited(email.trim());
  if (!row?.password) {
    await verifyPassword(password, await dummyHash());
    return { ok: false, reason: "wrong" };
  }
  if (row.password.lockedUntil && row.password.lockedUntil > now) return { ok: false, reason: "locked" };

  if (!(await verifyPassword(password, row.password.passwordHash))) {
    const next = afterFailure(row.password.failedAttempts, now);
    await db().update(schema.userPasswords).set(next).where(eq(schema.userPasswords.userId, row.user.id));
    return { ok: false, reason: next.lockedUntil ? "locked" : "wrong" };
  }

  await db()
    .update(schema.userPasswords)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(schema.userPasswords.userId, row.user.id));
  return { ok: true, ...(await createSession(row.user.id, now)) };
}

export type SetPasswordResult = { ok: true } | { ok: false; message: string };

/**
 * Sets or changes the signed-in user's password. Changing one needs the current password. Afterwards every
 * other session of theirs ends, so a lost device stops working; the current one stays signed in.
 */
export async function setPassword(
  user: { id: string; email: string },
  currentPassword: string | null,
  newPassword: string,
  keepSessionToken: string | null
): Promise<SetPasswordResult> {
  const problem = passwordProblem(newPassword, user.email);
  if (problem) return { ok: false, message: problem };
  const [existing] = await db().select().from(schema.userPasswords).where(eq(schema.userPasswords.userId, user.id));
  if (existing && !(currentPassword && (await verifyPassword(currentPassword, existing.passwordHash)))) {
    return { ok: false, message: "Your current password isn't right." };
  }
  const passwordHash = await hashPassword(newPassword);
  await db().transaction(async (tx) => {
    await tx
      .insert(schema.userPasswords)
      .values({ userId: user.id, passwordHash })
      .onConflictDoUpdate({
        target: schema.userPasswords.userId,
        set: { passwordHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() },
      });
    await tx
      .delete(schema.sessions)
      .where(
        keepSessionToken
          ? and(eq(schema.sessions.userId, user.id), ne(schema.sessions.sessionToken, keepSessionToken))
          : eq(schema.sessions.userId, user.id)
      );
    await tx.insert(schema.auditEvents).values({
      siteId: null,
      actorUserId: user.id,
      action: existing ? "password.changed" : "password.set",
      entityType: "user",
      entityId: user.id,
    });
  });
  return { ok: true };
}

export async function hasPassword(userId: string): Promise<boolean> {
  const rows = await db()
    .select({ one: sql`1` })
    .from(schema.userPasswords)
    .where(eq(schema.userPasswords.userId, userId))
    .limit(1);
  return rows.length > 0;
}
