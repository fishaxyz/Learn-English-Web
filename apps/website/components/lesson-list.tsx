import type { LessonCardFragment } from "@english/graphql";
import { LevelBadge, minutes } from "@english/ui";
import Link from "next/link";

const PATH: Record<string, string> = { READING: "reading" };

export function lessonHref(lesson: { kind: string; slug: string }) {
  const section = PATH[lesson.kind];
  return section ? `/${section}/${lesson.slug}` : null;
}

function LessonCard({ lesson }: { lesson: LessonCardFragment }) {
  const href = lessonHref(lesson);
  const reading = lesson.__typename === "ReadingResource" ? lesson.estimatedReadingSeconds : null;
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
        <LevelBadge level={lesson.cefrLevel} />
        {reading ? <span>{minutes(reading)}</span> : null}
      </div>
      <h3 className="font-display text-xl font-semibold text-ink group-hover:text-accent">{lesson.title}</h3>
      {lesson.summary ? <p className="text-muted">{lesson.summary}</p> : null}
      {lesson.topics.length ? (
        <p className="mt-auto text-sm text-muted">{lesson.topics.map((t) => t.name).join(" · ")}</p>
      ) : null}
    </>
  );
  return (
    <li className="h-full">
      {href ? (
        <Link
          href={href}
          className="group flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          {body}
        </Link>
      ) : (
        <div className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-5">{body}</div>
      )}
    </li>
  );
}

export function LessonList({ lessons, empty }: { lessons: LessonCardFragment[]; empty: string }) {
  if (!lessons.length) {
    return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">{empty}</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {lessons.map((lesson) => (
        <LessonCard key={lesson.id} lesson={lesson} />
      ))}
    </ul>
  );
}

/** "More lessons": a plain link carrying the cursor, so pages work without JavaScript. */
export function NextPage({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <p className="mt-8 text-center">
      <Link href={href} className="rounded-full border border-line px-5 py-2 font-medium hover:border-accent">
        More lessons
      </Link>
    </p>
  );
}
