import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth, signOut } from "../../auth";
import { LogOutIcon, SearchIcon } from "../../components/icons";
import { SidebarNav } from "../../components/sidebar-nav";
import { UserMenu } from "../../components/user-menu";
import { serverEnv } from "../../lib/env";
import { getViewer } from "../../lib/viewer";

export const dynamic = "force-dynamic";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/sign-in" });
}

/**
 * The dashboard frame: a black sidebar with every section (unbuilt ones marked "Soon"), and a top bar with search
 * and the account menu. On small screens the sidebar becomes a scrolling bar above the page.
 */
export default async function EditorLayout({ children }: { children: ReactNode }) {
  if (!(await auth())) redirect("/sign-in");
  const viewer = await getViewer();
  const membership = viewer.memberships[0];
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col gap-4 p-3 sm:p-4 lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-3 rounded-[28px] bg-sidebar p-4 text-white lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] lg:w-64 lg:gap-2 lg:overflow-y-auto lg:p-5">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 pb-2 text-2xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-pink"
        >
          english skills
          <span aria-hidden="true" className="size-2.5 rounded-full bg-pink" />
        </Link>
        <nav aria-label="Dashboard" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col lg:overflow-visible">
          <SidebarNav items={[{ href: "/", label: "Dashboard", icon: "home", exact: true }]} />
          <SidebarNav
            title="Content"
            items={[
              { href: "/lessons", label: "Reading Library", icon: "book" },
              { label: "Listening Studio", icon: "headphones" },
              { href: "/words", label: "Lexical Studio", icon: "layers" },
              { label: "Question Bank", icon: "question" },
              { label: "Blog", icon: "article" },
              { label: "Media Library", icon: "image" },
            ]}
          />
          <SidebarNav title="AI tools" items={[{ label: "AI Content Studio", icon: "sparkles" }]} />
          <SidebarNav
            title="Management"
            items={[
              { label: "Categories", icon: "tag" },
              { label: "Tags", icon: "tag" },
              { label: "Collections", icon: "collection" },
              { label: "Users & Roles", icon: "users" },
              { label: "Settings", icon: "settings" },
            ]}
          />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex items-center gap-3">
          <form action="/lessons" role="search" className="relative max-w-xl flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon />
            </span>
            <label htmlFor="top-search" className="sr-only">
              Search readings
            </label>
            <input
              id="top-search"
              name="q"
              type="search"
              placeholder="Search readings by title, topic, address…"
              className="w-full rounded-full border border-line bg-surface py-2.5 pl-11 pr-4 text-sm focus-visible:outline-2 focus-visible:outline-accent"
            />
          </form>
          <div className="ml-auto">
            <UserMenu
              email={viewer.email}
              role={membership?.role ?? "VIEWER"}
              websiteUrl={serverEnv().WEBSITE_URL}
              sites={viewer.memberships.map((m) => ({ id: m.site.id, name: m.site.name }))}
              logOut={
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-paper"
                  >
                    <LogOutIcon /> Log out
                  </button>
                </form>
              }
            />
          </div>
        </header>
        <main id="main" className="min-w-0 px-1 pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
