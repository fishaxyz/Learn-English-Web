"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { inTab, levelTone, TABS, TINTS, topicEmoji, type LibraryTab, type ReadingRow } from "../lib/readings";
import * as I from "./icons";
import { StatusPill } from "./status";

type Sort = "updated-desc" | "updated-asc" | "title";
type View = "list" | "grid";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const SORTS: { id: Sort; label: string }[] = [
  { id: "updated-desc", label: "Updated (newest)" },
  { id: "updated-asc", label: "Updated (oldest)" },
  { id: "title", label: "Title (A–Z)" },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

/** The "…" menu on each reading: edit, preview, and the live page when there is one. */
function RowMenu({ row, websiteUrl }: { row: ReadingRow; websiteUrl: string }) {
  // Placed against the window, so the table's sideways scrolling can't clip it; above the button near the bottom.
  const [open, setOpen] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const shut = () => setOpen(null);
    window.addEventListener("scroll", shut, { passive: true, capture: true });
    window.addEventListener("resize", shut);
    return () => {
      window.removeEventListener("scroll", shut, { capture: true });
      window.removeEventListener("resize", shut);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const item = "block rounded-xl px-3 py-2 text-sm hover:bg-paper";
  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-label={`Actions for “${row.title}”`}
        aria-expanded={!!open}
        onClick={(e) => {
          if (open) return setOpen(null);
          const r = e.currentTarget.getBoundingClientRect();
          const right = window.innerWidth - r.right;
          setOpen(
            r.bottom + 180 > window.innerHeight
              ? { bottom: window.innerHeight - r.top + 4, right }
              : { top: r.bottom + 4, right }
          );
        }}
        className="grid size-9 place-items-center rounded-xl border border-line bg-surface hover:border-ink"
      >
        <I.MoreIcon />
      </button>
      {open ? (
        <div
          style={open}
          className="fixed z-30 w-48 rounded-2xl border border-line bg-surface p-1.5 text-left shadow-xl"
        >
          <Link href={`/lessons/${row.id}`} className={item}>
            Edit
          </Link>
          <Link href={`/lessons/${row.id}/preview`} className={item}>
            Preview
          </Link>
          {row.live ? (
            <a href={`${websiteUrl}/reading/${row.slug}`} target="_blank" rel="noreferrer" className={item}>
              View on the website<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Topic({ topics }: { topics: ReadingRow["topics"] }) {
  const [first] = topics;
  if (!first) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-paper text-sm">
        {topicEmoji(first.slug)}
      </span>
      {first.name}
      {topics.length > 1 ? <span className="text-xs text-muted">+{topics.length - 1}</span> : null}
    </span>
  );
}

function Level({ level }: { level: string | null }) {
  return (
    <span
      className={`inline-flex min-w-10 justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${levelTone(level)}`}
    >
      {level ?? "—"}
    </span>
  );
}

/**
 * Every reading on the site, as editors browse it: counts, topics to jump into, status tabs, search, filters and
 * sorting, in a table or as cards. Filters live in the address, so a view can be shared or bookmarked.
 */
export function ReadingLibrary({
  rows,
  topics,
  newHref,
  websiteUrl,
}: {
  rows: ReadingRow[];
  topics: { slug: string; name: string }[];
  /** Where "Create reading" goes; null when this role can't write. */
  newHref: string | null;
  websiteUrl: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "all") as LibraryTab;
  const q = params.get("q") ?? "";
  const topic = params.get("topic") ?? "";
  const level = params.get("level") ?? "";
  const sort = (SORTS.some((s) => s.id === params.get("sort")) ? params.get("sort") : "updated-desc") as Sort;
  const view = (params.get("view") === "grid" ? "grid" : "list") as View;
  const [search, setSearch] = useState(q);
  const topicsRow = useRef<HTMLUListElement>(null);

  // Keep the search box in step when the top bar's search changes the address.
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    setSearch(q);
  }

  function set(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      const isDefault =
        !v || (k === "tab" && v === "all") || (k === "sort" && v === "updated-desc") || (k === "view" && v === "list");
      if (isDefault) next.delete(k);
      else next.set(k, v);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // Search as they type, after a short pause.
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => set({ q: search.trim() }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const counts = {
    total: rows.filter((r) => inTab(r, "all")).length,
    published: rows.filter((r) => inTab(r, "published")).length,
    drafts: rows.filter((r) => inTab(r, "drafts")).length,
    review: rows.filter((r) => inTab(r, "review")).length,
  };
  const perTopic = new Map(
    topics.map((t) => [t.slug, rows.filter((r) => inTab(r, "all") && r.topics.some((x) => x.slug === t.slug)).length])
  );

  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    const list = rows.filter(
      (r) =>
        inTab(r, tab) &&
        (!topic || r.topics.some((t) => t.slug === topic)) &&
        (!level || r.level === level) &&
        (!needle ||
          r.title.toLowerCase().includes(needle) ||
          r.slug.includes(needle) ||
          r.topics.some((t) => t.name.toLowerCase().includes(needle)))
    );
    return list.sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "updated-asc"
          ? a.updatedAt.localeCompare(b.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [rows, tab, topic, level, q, sort]);

  const stats = [
    {
      label: "Total readings",
      value: counts.total,
      icon: I.BookIcon,
      tone: "bg-surface",
      iconTone: "bg-paper",
      tab: "all",
    },
    {
      label: "Published",
      value: counts.published,
      icon: I.CheckCircleIcon,
      tone: "bg-pink/45",
      iconTone: "bg-pink",
      tab: "published",
    },
    {
      label: "Drafts",
      value: counts.drafts,
      icon: I.HourglassIcon,
      tone: "bg-sun/45",
      iconTone: "bg-sun",
      tab: "drafts",
    },
    { label: "In review", value: counts.review, icon: I.EyeIcon, tone: "bg-sky/45", iconTone: "bg-sky", tab: "review" },
  ] as const;
  const select =
    "rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm focus-visible:outline-2 focus-visible:outline-accent";
  const filtered = !!(q || topic || level);
  const cards = (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map((r) => (
        <li key={r.id} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-paper text-2xl">
              {topicEmoji(r.topics[0]?.slug)}
            </span>
            <RowMenu row={r} websiteUrl={websiteUrl} />
          </div>
          <Link href={`/lessons/${r.id}`} className="text-lg font-semibold leading-snug hover:underline">
            {r.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Level level={r.level} />
            <StatusPill status={r.status} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 text-sm text-muted">
            <Topic topics={r.topics} />
            <time dateTime={r.updatedAt} suppressHydrationWarning>
              {when(r.updatedAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-pink text-on-pastel">
            <I.BookIcon width={28} height={28} />
          </span>
          <div>
            <h1 className="text-4xl font-medium tracking-tight">Reading Library</h1>
            <p className="text-muted">Manage reading lessons for the English learning website.</p>
          </div>
        </div>
        {newHref ? (
          <Link
            href={newHref}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong"
          >
            <I.PlusIcon /> Create reading
          </Link>
        ) : null}
      </div>

      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => set({ tab: s.tab })}
              aria-pressed={tab === s.tab}
              className={`flex w-full items-center gap-3 rounded-3xl border border-line p-4 text-left sm:gap-4 sm:p-5 hover:border-ink aria-pressed:border-ink ${s.tone}`}
            >
              <span
                aria-hidden="true"
                className={`grid size-12 place-items-center rounded-2xl text-on-pastel ${s.iconTone}`}
              >
                <s.icon width={22} height={22} />
              </span>
              <span>
                <span className="block text-3xl font-semibold tracking-tight">{s.value.toLocaleString("en")}</span>
                <span className="text-muted">{s.label}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {topics.length ? (
        <section aria-label="Topics" className="relative">
          <ul ref={topicsRow} className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {topics.map((t, i) => (
              <li key={t.slug} className="snap-start">
                <button
                  type="button"
                  aria-pressed={topic === t.slug}
                  onClick={() => set({ topic: topic === t.slug ? "" : t.slug })}
                  className="flex w-40 flex-col items-center gap-2 rounded-3xl border border-line bg-surface p-4 text-center hover:border-ink aria-pressed:border-ink aria-pressed:ring-2 aria-pressed:ring-ink"
                >
                  <span
                    aria-hidden="true"
                    className={`grid size-16 place-items-center rounded-2xl text-4xl ${TINTS[i % TINTS.length]}`}
                  >
                    {topicEmoji(t.slug)}
                  </span>
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-sm text-muted">
                    {perTopic.get(t.slug) ?? 0} reading{perTopic.get(t.slug) === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {topics.length > 4 ? (
            <button
              type="button"
              aria-label="More topics"
              onClick={() => topicsRow.current?.scrollBy({ left: 340, behavior: "smooth" })}
              className="absolute right-0 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface shadow-md hover:border-ink sm:grid"
            >
              <I.ChevronRightIcon />
            </button>
          ) : null}
        </section>
      ) : null}

      <nav aria-label="Status" className="flex gap-6 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => set({ tab: t.id })}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent pb-3 text-muted hover:text-ink aria-[current=page]:border-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink"
          >
            {t.label} <span className="text-xs">({rows.filter((r) => inTab(r, t.id)).length})</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <I.SearchIcon />
          </span>
          <label htmlFor="library-search" className="sr-only">
            Search readings
          </label>
          <input
            id="library-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search readings…"
            className="w-full rounded-xl border border-line bg-surface py-2 pl-10 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <label className="sr-only" htmlFor="filter-topic">
          Topic
        </label>
        <select id="filter-topic" value={topic} onChange={(e) => set({ topic: e.target.value })} className={select}>
          <option value="">Topic: All</option>
          {topics.map((t) => (
            <option key={t.slug} value={t.slug}>
              Topic: {t.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-level">
          Level
        </label>
        <select id="filter-level" value={level} onChange={(e) => set({ level: e.target.value })} className={select}>
          <option value="">Level: All</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              Level: {l}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="sort">
          Sort
        </label>
        <select id="sort" value={sort} onChange={(e) => set({ sort: e.target.value })} className={select}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <div role="group" aria-label="View" className="flex rounded-xl border border-line bg-surface p-1">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={v === "grid" ? "Cards" : "Table"}
              onClick={() => set({ view: v })}
              className="grid size-8 place-items-center rounded-lg text-muted aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {v === "grid" ? <I.GridIcon /> : <I.ListIcon />}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line p-10 text-center text-muted">
          <p>
            {filtered
              ? "No readings match these filters."
              : tab === "review"
                ? "Nothing is waiting for review."
                : tab === "archived"
                  ? "No archived readings."
                  : "No readings yet. Start with “Create reading”."}
          </p>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                set({ q: "", topic: "", level: "" });
              }}
              className="rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:border-ink"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : view === "grid" ? (
        cards
      ) : (
        <>
          {/* On phones the table becomes cards. */}
          <div className="sm:hidden">{cards}</div>
          <div className="hidden overflow-x-auto rounded-3xl border border-line bg-surface sm:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-panel/60 text-xs text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Topic</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t border-line hover:bg-paper/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper text-xl"
                        >
                          {topicEmoji(r.topics[0]?.slug)}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/lessons/${r.id}`} className="font-semibold hover:underline">
                            {r.title}
                          </Link>
                          <p className="truncate font-mono text-xs text-muted">/reading/{r.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Topic topics={r.topics} />
                    </td>
                    <td className="px-4 py-3">
                      <Level level={r.level} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <time dateTime={r.updatedAt} suppressHydrationWarning>
                        {when(r.updatedAt)}
                      </time>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <RowMenu row={r} websiteUrl={websiteUrl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-sm text-muted" aria-live="polite">
        Showing {shown.length} of {rows.filter((r) => inTab(r, tab)).length}
      </p>
    </div>
  );
}
