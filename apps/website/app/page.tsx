import { LessonListDocument } from "@english/graphql";
import Link from "next/link";
import { LessonList } from "../components/lesson-list";
import { publicQuery } from "../lib/api";
import { LEVELS } from "../lib/levels";

// Rendered per request (the API isn't reachable at build time); its data is still cached by tag and refreshed on publish.
export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await publicQuery(LessonListDocument, { first: 6, filter: { kind: "READING" } });
  return (
    <div className="flex flex-col gap-14">
      <section className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-4xl font-semibold text-balance sm:text-5xl">
          Read short English texts. Learn the words in them.
        </h1>
        <p className="text-lg text-muted">
          Every lesson is written for a level, from A1 to C2. Tap a highlighted word to see what it means, then check
          what you understood. No account needed.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {LEVELS.map((level) => (
            <Link
              key={level}
              href={`/levels/${level.toLowerCase()}`}
              className="rounded-full border border-line bg-surface px-4 py-1.5 font-semibold hover:border-accent hover:text-accent"
            >
              {level}
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="latest" className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="latest" className="font-display text-2xl font-semibold">
            New reading lessons
          </h2>
          <Link href="/reading" className="text-sm font-medium text-accent hover:underline">
            All reading lessons
          </Link>
        </div>
        <LessonList lessons={data.publishedResources.nodes} empty="The first lessons are on their way." />
      </section>
    </div>
  );
}
