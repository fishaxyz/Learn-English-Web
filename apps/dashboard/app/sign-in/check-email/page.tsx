import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email" };

/** The same page whether or not the address is invited, so it reveals nothing about who has an account. */
export default function CheckEmail() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">Check your email</h1>
      <p className="text-muted">
        If that address has been invited to the dashboard, a sign-in link is on its way. It works once and expires in 15
        minutes.
      </p>
      <Link href="/sign-in" className="text-sm font-medium text-accent hover:underline">
        Use a different address
      </Link>
    </main>
  );
}
