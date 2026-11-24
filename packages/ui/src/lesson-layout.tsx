import type { ReactNode } from "react";

const KIND_LABEL: Record<string, string> = {
  READING: "Reading",
  LISTENING: "Listening",
  LEXICAL_COLLECTION: "Vocabulary",
  ARTICLE: "Article",
};

export function LevelBadge({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold tracking-wide text-accent">
      {level}
    </span>
  );
}

export const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min read`;

/**
 * A lesson page's frame, shared by the website and the dashboard's preview: the title block, the text, then
 * whatever follows (vocabulary, exercises).
 */
export function LessonLayout({
  kind,
  level,
  title,
  summary,
  meta,
  children,
  after,
}: {
  kind: string;
  level?: string | null;
  title: string;
  summary?: string | null;
  meta?: ReactNode;
  children: ReactNode;
  after?: ReactNode;
}) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
          {KIND_LABEL[kind] ?? kind}
          <LevelBadge level={level} />
        </p>
        <h1 className="font-display text-4xl font-semibold text-balance text-ink sm:text-5xl">{title}</h1>
        {summary ? <p className="text-lg text-muted">{summary}</p> : null}
        {meta ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">{meta}</div> : null}
      </header>
      <div className="lesson-text font-reading text-[1.1875rem] leading-[1.75] text-ink">{children}</div>
      {after}
    </article>
  );
}
