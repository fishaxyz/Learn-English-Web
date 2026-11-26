import { ReadingLessonDocument } from "@english/graphql";
import { ExerciseRenderer, LessonLayout, minutes } from "@english/ui";
import { ReadingExperience } from "../../../components/reading-experience";
import { ReadingSettings } from "../../../components/reading-settings";
import { VoiceTags } from "../../../components/voice-tags";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { publicQuery, tagForLesson } from "../../../lib/api";
import { serverEnv } from "../../../lib/env";
import { gradeExercises } from "./actions";

// Rendered per request (the API isn't reachable at build time); its data is still cached by tag and refreshed on publish.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** One API call per request, shared by the page and its metadata. */
const getLesson = cache(async (slug: string) => {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  const data = await publicQuery(ReadingLessonDocument, { slug }, ["resources", tagForLesson("READING", slug)]);
  const lesson = data.resourceBySlug;
  return lesson && lesson.__typename === "ReadingResource" ? lesson : null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const lesson = await getLesson((await params).slug);
  if (!lesson) return { title: "Lesson not found", robots: { index: false } };
  return {
    title: lesson.title,
    description: lesson.summary ?? `A ${lesson.cefrLevel ?? ""} English reading lesson.`.replace("  ", " "),
    alternates: { canonical: `/reading/${lesson.slug}` },
    openGraph: { type: "article", title: lesson.title, description: lesson.summary ?? undefined },
  };
}

export default async function ReadingLessonPage({ params }: { params: Params }) {
  const lesson = await getLesson((await params).slug);
  if (!lesson) notFound();
  const tracks = lesson.audioTracks.filter((t) => t.url);

  // Truthful structured data: only what the page really shows (AGENTS.md §7).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: lesson.title,
    description: lesson.summary ?? undefined,
    learningResourceType: "Reading",
    educationalLevel: lesson.cefrLevel ? `CEFR ${lesson.cefrLevel}` : undefined,
    inLanguage: "en",
    timeRequired: `PT${Math.max(1, Math.round(lesson.estimatedReadingSeconds / 60))}M`,
    datePublished: lesson.publishedAt,
    url: new URL(`/reading/${lesson.slug}`, serverEnv().SITE_URL).toString(),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped, so the content can't close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <LessonLayout
        kind="READING"
        level={lesson.cefrLevel}
        title={lesson.title}
        meta={
          <>
            <span>{minutes(lesson.estimatedReadingSeconds)}</span>
            <span>{lesson.wordCount} words</span>
            {lesson.topics.map((t) => (
              <Link key={t.slug} href={`/topics/${t.slug}`} className="hover:text-accent hover:underline">
                {t.name}
              </Link>
            ))}
            {lesson.examLabels.map((l) => (
              <span key={l.code} className="rounded-md border border-line px-1.5 text-xs">
                {l.name}
              </span>
            ))}
            {tracks.length === 1 && tracks[0] ? (
              <span className="ml-auto">
                <VoiceTags label={tracks[0].label} />
              </span>
            ) : null}
          </>
        }
        aside={<ReadingSettings />}
      >
        <ReadingExperience
          body={lesson.body}
          items={lesson.vocabularyItems}
          lesson={{ slug: lesson.slug, title: lesson.title }}
          tracks={tracks}
          speakers={lesson.speakerNames}
          questionCount={lesson.exerciseSets.reduce((n, set) => n + set.questions.length, 0)}
          questions={lesson.exerciseSets.map((set) => (
            <ExerciseRenderer key={set.id} set={set} grade={gradeExercises} />
          ))}
        />
      </LessonLayout>
    </>
  );
}
