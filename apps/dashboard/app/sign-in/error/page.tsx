import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign-in problem" };

const MESSAGES: Record<string, { title: string; body: string }> = {
  "not-invited": {
    title: "That Google account isn't invited",
    body: "Only people invited to the dashboard can sign in. Ask the site's owner to invite this Google account's email address, or sign in with the address you were invited with.",
  },
  unverified: {
    title: "Google hasn't verified that email address",
    body: "Verify the address in your Google account first, or sign in with an email link instead.",
  },
};

const DEFAULT = {
  title: "That sign-in didn't work",
  body: "Email links work once and expire after 15 minutes, and only invited addresses can sign in. Ask for a new link, or ask the site's owner to invite you.",
};

export default async function SignInError({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = (reason && MESSAGES[reason]) || DEFAULT;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-4xl font-medium tracking-tight">{message.title}</h1>
      <p className="text-muted">{message.body}</p>
      <Link href="/sign-in" className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent">
        Back to sign-in
      </Link>
    </main>
  );
}
