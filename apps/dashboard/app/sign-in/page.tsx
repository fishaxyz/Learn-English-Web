import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "../../auth";
import { serverEnv } from "../../lib/env";
import { loginWithPassword, sessionCookieName } from "../../lib/password-login";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requestLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email) || email.length > 254) redirect("/sign-in?error=email");
  await signIn("nodemailer", { email, redirectTo: "/" });
}

async function passwordSignIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!EMAIL.test(email) || email.length > 254 || !password || password.length > 128) redirect("/sign-in?error=wrong");
  const result = await loginWithPassword(email, password);
  if (!result.ok) redirect(`/sign-in?error=${result.reason}`);
  // The same HttpOnly session cookie an email-link sign-in sets: nothing else is stored in the browser.
  const secure = serverEnv().AUTH_URL.startsWith("https:");
  (await cookies()).set(sessionCookieName(secure), result.sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: result.expires,
  });
  redirect("/");
}

async function continueWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/" });
}

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await auth()) redirect("/");
  const { error } = await searchParams;
  const env = serverEnv();
  const google = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">English Skills dashboard</p>
        <h1 className="font-display text-3xl font-semibold">Sign in</h1>
        <p className="text-muted">
          {google
            ? "Use the Google account or email address you were invited with."
            : "Use the email address you were invited with."}
        </p>
      </div>
      {google ? (
        <>
          <form action={continueWithGoogle}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-full border border-line bg-surface px-5 py-2.5 font-semibold hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z"
                />
              </svg>
              Continue with Google
            </button>
          </form>
          <p className="flex items-center gap-3 text-sm text-muted">
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            or with your password
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </p>
        </>
      ) : null}
      <form action={passwordSignIn} className="flex flex-col gap-3">
        <label htmlFor="email" className="font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
        />
        <label htmlFor="password" className="font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          className="rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
        />
        {error === "wrong" ? (
          <p role="alert" className="text-sm text-bad">
            That email and password don&apos;t match. If you haven&apos;t set a password yet, use an email link below.
          </p>
        ) : null}
        {error === "locked" ? (
          <p role="alert" className="text-sm text-bad">
            Too many wrong tries: password sign-in is paused for 15 minutes. You can still sign in with an email link.
          </p>
        ) : null}
        <button
          type="submit"
          className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong"
        >
          Sign in
        </button>
      </form>
      <details className="rounded-xl border border-line bg-surface p-4" open={error === "email" || undefined}>
        <summary className="cursor-pointer font-medium">
          No password yet, or forgot it? Get a sign-in link by email
        </summary>
        <form action={requestLink} className="mt-3 flex flex-col gap-3">
          <label htmlFor="link-email" className="text-sm font-medium">
            Email for a sign-in link
          </label>
          <input
            id="link-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent"
          />
          {error === "email" ? (
            <p role="alert" className="text-sm text-bad">
              That doesn&apos;t look like an email address.
            </p>
          ) : null}
          <button type="submit" className="rounded-full border border-line px-5 py-2 font-semibold hover:border-accent">
            Email me a sign-in link
          </button>
          <p className="text-sm text-muted">
            The link works once and expires in 15 minutes. Then set a password on your Account page.
          </p>
        </form>
      </details>
    </main>
  );
}
