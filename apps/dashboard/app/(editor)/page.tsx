import { EditorialListDocument } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
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
  const inReview = editorialResources.filter(
    (r) => statusOf(r.archivedAt, r.localizations[0]).label === "In review"
  ).length;
  const q = (extra: Record<string, string>) => `/?${new URLSearchParams({ site: membership.site.id, ...extra })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {membership.site.name} · you&apos;re {membership.role.toLowerCase()}
          </p>
          <h1 className="font-display text-3xl font-semibold">Lessons</h1>
        </div>
        {can.write(membership.role) ? (
          <Link
            href={`/lessons/new?site=${membership.site.id}`}
            className="rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong"
          >
            New lesson
          </Link>
        ) : null}
      </div>

      {viewer.memberships.length > 1 ? (
        <nav aria-label="Sites" className="flex flex-wrap gap-2 text-sm">
          {viewer.memberships.map((m) => (
            <Link
              key={m.site.id}
              href={`/?site=${m.site.id}`}
              aria-current={m.site.id === membership.site.id ? "page" : undefined}
              className="rounded-full border border-line px-3 py-1 aria-[current=page]:border-accent aria-[current=page]:text-accent"
            >
              {m.site.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <nav aria-label="Filter" className="flex gap-2 text-sm">
        <Link
          href={q({})}
          aria-current={show !== "review" ? "page" : undefined}
          className="rounded-full border border-line px-3 py-1 aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
        >
          All
        </Link>
        <Link
          href={q({ show: "review" })}
          aria-current={show === "review" ? "page" : undefined}
          className="rounded-full border border-line px-3 py-1 aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
        >
          Needs review ({inReview})
        </Link>
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          {show === "review" ? "Nothing is waiting for review." : "No lessons yet. Start with “New lesson”."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-muted">
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
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-4 py-3">
                      <Link href={`/lessons/${r.id}`} className="font-semibold hover:text-accent hover:underline">
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
