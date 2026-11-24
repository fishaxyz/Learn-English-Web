import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { schema } from "@english/database";
import { eq, sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { createTransport } from "nodemailer";
import { db } from "./lib/db";
import { decideSignIn } from "./lib/sign-in-rules";
import { serverEnv } from "./lib/env";

/** Only people with a role on at least one site may sign in. Invitations are made with the invite command. */
async function isInvited(email: string): Promise<boolean> {
  const rows = await db()
    .select({ one: sql`1` })
    .from(schema.users)
    .innerJoin(schema.siteMemberships, eq(schema.siteMemberships.userId, schema.users.id))
    .where(eq(sql`lower(${schema.users.email})`, email.toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

async function sendSignInLink({ identifier, url }: { identifier: string; url: string }) {
  const env = serverEnv();
  if (env.EMAIL_SERVER) {
    await createTransport(env.EMAIL_SERVER).sendMail({
      to: identifier,
      from: env.EMAIL_FROM,
      subject: "Your sign-in link for the English Skills dashboard",
      text: `Sign in to the English Skills dashboard:\n\n${url}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    });
    return;
  }
  if (env.APP_ENV === "development") {
    // Local development only: the link goes to a file instead of an inbox.
    await mkdir(dirname(env.AUTH_DEV_MAILBOX), { recursive: true });
    await appendFile(
      env.AUTH_DEV_MAILBOX,
      JSON.stringify({ to: identifier, url, at: new Date().toISOString() }) + "\n"
    );
    console.info(
      JSON.stringify({ level: "info", service: "dashboard", msg: "sign-in link written to the dev mailbox" })
    );
    return;
  }
  throw new Error("Sign-in email isn't configured: set EMAIL_SERVER");
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = serverEnv();
  return {
    secret: env.AUTH_SECRET,
    adapter: DrizzleAdapter(db(), {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    // Sessions live in the database; the browser holds only an HttpOnly cookie with a random token.
    session: { strategy: "database", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
    providers: [
      Nodemailer({
        from: env.EMAIL_FROM,
        maxAge: 15 * 60,
        // Auth.js requires a transport even though sendSignInLink does the sending; JSON transport sends nothing.
        server: env.EMAIL_SERVER ?? { jsonTransport: true },
        sendVerificationRequest: sendSignInLink,
      }),
      ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
        ? [
            Google({
              clientId: env.AUTH_GOOGLE_ID,
              clientSecret: env.AUTH_GOOGLE_SECRET,
              // Invited people already have a user row (made by the invite). Linking a Google account to it by
              // email is safe here because decideSignIn requires Google's email_verified and an invitation.
              allowDangerousEmailAccountLinking: true,
              // Always show Google's account chooser, so a shared computer doesn't sign in the wrong person.
              authorization: { params: { prompt: "select_account" } },
            }),
          ]
        : []),
    ],
    pages: { signIn: "/sign-in", verifyRequest: "/sign-in/check-email", error: "/sign-in/error" },
    callbacks: {
      async signIn({ user, email, account, profile }) {
        const address = user.email ?? (typeof profile?.email === "string" ? profile.email : null);
        return decideSignIn({
          provider: account?.provider ?? "",
          requestingLink: Boolean(email?.verificationRequest),
          email: address,
          emailVerified: typeof profile?.email_verified === "boolean" ? profile.email_verified : null,
          invited: address ? await isInvited(address) : false,
        });
      },
    },
  };
});
