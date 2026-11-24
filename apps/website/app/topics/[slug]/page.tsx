import { LessonListDocument, SiteTopicsDocument } from "@english/graphql";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { LessonList } from "../../../components/lesson-list";
import { publicQuery } from "../../../lib/api";

// Rendered per request (the API isn't reachable at build time); its data is still cached by tag and refreshed on publish.
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

const getTopic = cache(async (slug: string) => {
  const data = await publicQuery(SiteTopicsDocument, {}, ["topics"]);
  return data.topics.find((t) => t.slug === slug) ?? null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const topic = await getTopic((await params).slug);
  if (!topic) return { title: "Topic not found", robots: { index: false } };
  return {
    title: `${topic.name}: English lessons`,
    description: topic.description ?? `English lessons about ${topic.name.toLowerCase()}.`,
    alternates: { canonical: `/topics/${topic.slug}` },
  };
}

export default async function TopicPage({ params }: { params: Params }) {
  const topic = await getTopic((await params).slug);
  if (!topic) notFound();
  const data = await publicQuery(LessonListDocument, { first: 24, filter: { kind: "READING", topicSlug: topic.slug } });
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Topic</p>
        <h1 className="font-display text-4xl font-semibold">{topic.name}</h1>
        {topic.description ? <p className="max-w-2xl text-lg text-muted">{topic.description}</p> : null}
      </header>
      <LessonList lessons={data.publishedResources.nodes} empty="No lessons on this topic yet." />
    </div>
  );
}
