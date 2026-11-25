import { EditorialListDocument } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "../../components/icons";
import { StatusChip, statusOf } from "../../components/status";
import { editorQuery } from "../../lib/api";
import { can, getViewer, membershipFor } from "../../lib/viewer";

export const metadata: Metadata = { title: "Lessons" };

const KIND = { READING: "Reading", LISTENING: "Listening", LEXICAL_COLLECTION: "Vocabulary", ARTICLE: "Article" };

export default async function Lessons({ searchParams }: { searchParams: Promise<{ site?: string; show?: string }> }) {
  const viewer = await getViewer();
  const { site: siteParam, show } = await searchParams;
  const membership = membershipFor(viewer, siteParam);
  const { editorialResources } = await editorQuery(EditorialListDocument, { siteId: membership.site.id });
  const rows = editorialResources.filter(
    (r) => show !== "review" || statusOf(r.archivedAt, r.localizations[0]).label === "In review"
  );
  const count = (...labels: string[]) =>
    editorialResources.filter((r) => labels.includes(statusOf(r.archivedAt, r.localizations[0]).label)).length;
  const inReview = count("In review");
  const cards = [
    {
      label: "Published",
      value: count("Published", "Published · new draft"),
      note: "Live on the website",
      tone: "bg-pink",
    },
    { label: "In review", value: inReview, note: "Waiting for a reviewer", tone: "bg-sky" },
    { label: "Drafts", value: count("Draft", "Published · new draft"), note: "Being written", tone: "bg-sun" },
  ];
  const pill =
    "rounded-full border border-line px-4 py-1.5 font-medium hover:border-ink aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-on-accent";
  const q = (extra: Record<string, string>) => `/?${new URLSearchParams({ site: membership.site.id, ...extra })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {membership.site.name} · you&apos;re {membership.role.toLowerCase()}
          </p>
          <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">Your lessons</h1>
        </div>
        {can.write(membership.role) ? (
          <Link
            href={`/lessons/new?site=${membership.site.id}`}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong"
          >
            <PlusIcon /> New lesson
          </Link>
        ) : null}
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label} className={`flex flex-col gap-1 rounded-3xl p-5 text-on-pastel ${c.tone}`}>
            <p className="font-semibold">{c.label}</p>
            <p className="text-4xl font-medium tracking-tight">{c.value}</p>
            <p className="text-xs opacity-75">{c.note}</p>
          </li>
        ))}
      </ul>

      {viewer.memberships.length > 1 ? (
        <nav aria-label="Sites" className="flex flex-wrap gap-2 text-sm">
          {viewer.memberships.map((m) => (
            <Link
              key={m.site.id}
              href={`/?site=${m.site.id}`}
              aria-current={m.site.id === membership.site.id ? "page" : undefined}
              className={pill}
            >
              {m.site.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <nav aria-label="Filter" className="flex gap-2 text-sm">
        <Link href={q({})} aria-current={show !== "review" ? "page" : undefined} className={pill}>
          All
        </Link>
        <Link href={q({ show: "review" })} aria-current={show === "review" ? "page" : undefined} className={pill}>
          Needs review ({inReview})
        </Link>
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line p-10 text-center text-muted">
          {show === "review" ? "Nothing is waiting for review." : "No lessons yet. Start with “New lesson”."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-panel p-2">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Address</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const l = r.localizations[0];
                const title = l?.draft?.title ?? l?.published?.title ?? "Untitled";
                return (
                  <tr key={r.id} className="border-t border-line/70 hover:bg-surface/70">
                    <td className="px-4 py-3">
                      <Link href={`/lessons/${r.id}`} className="font-semibold hover:underline">
                        {title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{KIND[r.kind]}</td>
                    <td className="px-4 py-3">
                      <StatusChip archivedAt={r.archivedAt} localization={l} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{l?.slug}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
