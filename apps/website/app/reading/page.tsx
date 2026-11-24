import { LessonListDocument, type CefrLevel } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
import { LessonList, NextPage } from "../../components/lesson-list";
import { ApiError, publicQuery } from "../../lib/api";
import { LEVELS } from "../../lib/levels";

// Rendered per request (the API isn't reachable at build time); its data is still cached by tag and refreshed on publish.
export const dynamic = "force-dynamic";

type Search = Promise<{ level?: string; after?: string }>;

const levelOf = (value: string | undefined) => LEVELS.find((l) => l === value?.toUpperCase()) as CefrLevel | undefined;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { level, after } = await searchParams;
  return {
    title: "Reading lessons",
    description: "Short English reading texts for every level, with vocabulary and comprehension exercises.",
    alternates: { canonical: "/reading" },
    // Filtered and later pages are for people, not search engines (one indexable list, AGENTS.md §7).
    ...(level || after ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ReadingIndex({ searchParams }: { searchParams: Search }) {
  const { level: rawLevel, after } = await searchParams;
  const level = levelOf(rawLevel);
  let data;
  try {
    data = await publicQuery(LessonListDocument, {
      first: 12,
      after: after ?? null,
      filter: { kind: "READING", ...(level ? { cefrLevel: level } : {}) },
    });
  } catch (error) {
    // A stale or forged cursor: start again from the first page.
    if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
      data = await publicQuery(LessonListDocument, { first: 12, filter: { kind: "READING" } });
    } else throw error;
  }
  const { nodes, pageInfo } = data.publishedResources;
  const next =
    pageInfo.hasNextPage && pageInfo.endCursor
      ? `/reading?${new URLSearchParams({ ...(level ? { level } : {}), after: pageInfo.endCursor })}`
      : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-semibold">Reading</h1>
        <p className="max-w-2xl text-lg text-muted">
          Short texts with the words you need explained in place, and questions to check your understanding.
        </p>
      </header>
      <nav aria-label="Filter by level" className="flex flex-wrap gap-2">
        <Link
          href="/reading"
          aria-current={!level ? "page" : undefined}
          className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
        >
          All levels
        </Link>
        {LEVELS.map((l) => (
          <Link
            key={l}
            href={`/reading?level=${l}`}
            aria-current={level === l ? "page" : undefined}
            className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
          >
            {l}
          </Link>
        ))}
      </nav>
      <LessonList lessons={nodes} empty={level ? `No ${level} reading lessons yet.` : "No reading lessons yet."} />
      <NextPage href={next} />
    </div>
  );
}
