import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "../../auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requestLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!EMAIL.test(email) || email.length > 254) redirect("/sign-in?error=email");
  await signIn("nodemailer", { email, redirectTo: "/" });
}

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await auth()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">English Skills dashboard</p>
        <h1 className="font-display text-3xl font-semibold">Sign in</h1>
        <p className="text-muted">
          Enter the email address you were invited with. We&apos;ll send you a link that signs you in; it works once and
          expires in 15 minutes.
        </p>
      </div>
      <form action={requestLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="font-medium">
          Email address
        </label>
        <input
          id="email"
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
        <button
          type="submit"
          className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong"
        >
          Email me a sign-in link
        </button>
      </form>
    </main>
  );
}
