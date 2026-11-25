import { EditorialListDocument, WordBankCountDocument } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
import * as I from "../../components/icons";
import { StatusPill } from "../../components/status";
import { editorQuery } from "../../lib/api";
import { inTab, readingRows, topicEmoji } from "../../lib/readings";
import { can, getViewer, membershipFor } from "../../lib/viewer";

export const metadata: Metadata = { title: "Dashboard" };

const when = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });

/** The editor's home: where things stand, what needs them, and the way into each section. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const viewer = await getViewer();
  const membership = membershipFor(viewer, (await searchParams).site);
  const siteId = membership.site.id;
  const [{ editorialResources }, { editorialSenses }] = await Promise.all([
    editorQuery(EditorialListDocument, { siteId }),
    editorQuery(WordBankCountDocument, { siteId }),
  ]);
  const rows = readingRows(editorialResources);
  const count = (tab: Parameters<typeof inTab>[1]) => rows.filter((r) => inTab(r, tab)).length;
  const recent = rows
    .filter((r) => inTab(r, "all"))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const waiting = rows.filter((r) => inTab(r, "review"));
  const words = editorialSenses.length;

  const cards = [
    { label: "Published readings", value: count("published"), href: "/lessons?tab=published", tone: "bg-pink" },
    { label: "Drafts", value: count("drafts"), href: "/lessons?tab=drafts", tone: "bg-sun" },
    { label: "In review", value: count("review"), href: "/lessons?tab=review", tone: "bg-sky" },
    { label: "Words in the word bank", value: words >= 100 ? "100+" : words, href: "/words", tone: "bg-good-soft" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {membership.site.name} · you&apos;re {membership.role.toLowerCase()}
          </p>
          <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">Dashboard</h1>
        </div>
        {can.write(membership.role) ? (
          <Link
            href={`/lessons/new?site=${siteId}`}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong"
          >
            <I.PlusIcon /> Create reading
          </Link>
        ) : null}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <li key={c.label}>
            <Link
              href={c.href}
              className={`flex h-full flex-col gap-1 rounded-3xl p-5 text-on-pastel transition-transform hover:-translate-y-0.5 ${c.tone}`}
            >
              <span className="font-semibold">{c.label}</span>
              <span className="text-4xl font-medium tracking-tight">{c.value}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="recent" className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 id="recent" className="text-xl font-semibold">
              Recently updated
            </h2>
            <Link href="/lessons" className="text-sm font-medium hover:underline">
              Reading Library →
            </Link>
          </div>
          {recent.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-lg"
                  >
                    {topicEmoji(r.topics[0]?.slug)}
                  </span>
                  <Link href={`/lessons/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {r.title}
                  </Link>
                  <StatusPill status={r.status} />
                  <span className="hidden w-14 text-right text-sm text-muted sm:block">{when(r.updatedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No readings yet.</p>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="waiting" className="flex flex-col gap-3 rounded-3xl bg-sky/45 p-5">
            <h2 id="waiting" className="text-xl font-semibold">
              Waiting for review
            </h2>
            {waiting.length ? (
              <ul className="flex flex-col gap-2">
                {waiting.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link href={`/lessons/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Nothing is waiting for review.</p>
            )}
          </section>
          <section
            aria-labelledby="shortcuts"
            className="flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5"
          >
            <h2 id="shortcuts" className="text-xl font-semibold">
              Go to
            </h2>
            {[
              { href: "/lessons", label: "Reading Library", icon: I.BookIcon },
              { href: "/words", label: "Lexical Studio", icon: I.LayersIcon },
              { href: "/account", label: "Account", icon: I.AccountIcon },
            ].map((s) => (
              <Link key={s.href} href={s.href} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-paper">
                <span className="grid size-9 place-items-center rounded-full bg-paper">
                  <s.icon />
                </span>
                {s.label}
              </Link>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
