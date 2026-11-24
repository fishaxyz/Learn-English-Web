import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign-in problem" };

export default function SignInError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">That sign-in link didn&apos;t work</h1>
      <p className="text-muted">
        Links work once and expire after 15 minutes, and only invited addresses can sign in. Ask for a new link, or ask
        the site&apos;s owner to invite you.
      </p>
      <Link href="/sign-in" className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent">
        Get a new link
      </Link>
    </main>
  );
}
