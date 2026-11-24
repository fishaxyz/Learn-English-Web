import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth, signOut } from "../../auth";
import { getViewer } from "../../lib/viewer";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/sign-in" });
}

export default async function EditorLayout({ children }: { children: ReactNode }) {
  if (!(await auth())) redirect("/sign-in");
  const viewer = await getViewer();
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-display text-lg font-semibold">
            English Skills <span className="font-sans text-sm font-normal text-muted">dashboard</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{viewer.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="rounded-full border border-line px-3 py-1 hover:border-accent">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </>
  );
}
