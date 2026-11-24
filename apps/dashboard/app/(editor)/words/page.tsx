import { WordBankDocument } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
import { editorQuery } from "../../../lib/api";
import { can, getViewer, membershipFor } from "../../../lib/viewer";
import { kindLabel, senseStatus } from "../../../lib/words";

export const metadata: Metadata = { title: "Word bank" };

export default async function WordBank({ searchParams }: { searchParams: Promise<{ site?: string; q?: string }> }) {
  const viewer = await getViewer();
  const { site, q } = await searchParams;
  const membership = membershipFor(viewer, site);
  const { editorialSenses: senses } = await editorQuery(WordBankDocument, {
    siteId: membership.site.id,
    query: q?.slice(0, 100) || null,
  });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{membership.site.name}</p>
          <h1 className="font-display text-3xl font-semibold">Word bank</h1>
          <p className="text-muted">Words and structures, prepared once and linked in any text.</p>
        </div>
        {can.write(membership.role) ? (
          <Link
            href={`/words/new?site=${membership.site.id}`}
            className="rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong"
          >
            New word or structure
          </Link>
        ) : null}
      </div>
      <form className="flex gap-2" role="search">
        <input type="hidden" name="site" value={membership.site.id} />
        <label htmlFor="q" className="sr-only">
          Search the word bank
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search…"
          className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2"
        />
        <button type="submit" className="rounded-full border border-line px-4 py-2 hover:border-accent">
          Search
        </button>
      </form>
      {senses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          {q ? `Nothing matches “${q}”.` : "The word bank is empty."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Word or structure</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Meaning</th>
                <th className="px-4 py-3 font-medium">Translations</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {senses.map((s) => {
                const r = s.draft ?? s.published;
                return (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-4 py-3">
                      <Link href={`/words/${s.id}`} className="font-semibold hover:text-accent hover:underline">
                        {s.entry.displayForm}
                      </Link>
                      <span className="ml-2 italic text-muted">{s.partOfSpeech}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{kindLabel(s.entry.kind)}</td>
                    <td className="max-w-xs px-4 py-3 text-muted">{r?.definition}</td>
                    <td className="px-4 py-3 text-muted">{r?.translations.map((t) => t.locale).join(", ") || "—"}</td>
                    <td className="px-4 py-3">{senseStatus(s)}</td>
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
