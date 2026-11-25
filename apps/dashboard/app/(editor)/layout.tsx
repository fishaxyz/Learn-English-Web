import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth, signOut } from "../../auth";
import { LogOutIcon } from "../../components/icons";
import { SidebarNav } from "../../components/sidebar-nav";
import { serverEnv } from "../../lib/env";
import { getViewer } from "../../lib/viewer";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/sign-in" });
}

/** The dashboard frame: a black sidebar beside the page (on small screens, a bar above it). */
export default async function EditorLayout({ children }: { children: ReactNode }) {
  if (!(await auth())) redirect("/sign-in");
  const viewer = await getViewer();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-4 p-3 sm:p-4 lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-3 rounded-[28px] bg-sidebar p-4 lg:gap-6 lg:p-5 text-white lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-60">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 text-2xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-pink"
        >
          english skills
          <span aria-hidden="true" className="size-2.5 rounded-full bg-pink" />
        </Link>
        <nav aria-label="Dashboard" className="flex flex-wrap gap-1 lg:flex-col lg:gap-5">
          <SidebarNav
            title="Content"
            items={[
              { href: "/", label: "Lessons", icon: "lessons", also: ["/lessons"] },
              { href: "/words", label: "Word bank", icon: "words" },
            ]}
          />
          <SidebarNav
            title="You"
            items={[
              { href: "/account", label: "Account", icon: "account" },
              { href: serverEnv().WEBSITE_URL, label: "View website", icon: "website", external: true },
            ]}
          />
        </nav>
        <div className="flex items-center gap-2 lg:mt-auto lg:flex-col lg:items-stretch lg:border-t lg:border-white/10 lg:pt-4">
          <p className="hidden truncate px-3 text-xs text-white/50 lg:block" title={viewer.email}>
            {viewer.email}
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-pink"
            >
              <span className="grid size-7 place-items-center">
                <LogOutIcon />
              </span>
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-1 py-6 sm:px-8 sm:py-8">
        {children}
      </main>
    </div>
  );
}
