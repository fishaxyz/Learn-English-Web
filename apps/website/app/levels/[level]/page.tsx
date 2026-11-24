import { LessonListDocument, type CefrLevel } from "@english/graphql";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonList } from "../../../components/lesson-list";
import { publicQuery } from "../../../lib/api";
import { LEVELS } from "../../../lib/levels";

// Rendered per request (the API isn't reachable at build time); its data is still cached by tag and refreshed on publish.
export const dynamic = "force-dynamic";

type Params = Promise<{ level: string }>;

const DESCRIPTIONS: Record<CefrLevel, string> = {
  A1: "Beginner: short, simple texts about everyday things.",
  A2: "Elementary: familiar topics, everyday situations and simple stories.",
  B1: "Intermediate: clear texts about work, travel and interests.",
  B2: "Upper intermediate: longer texts with opinions and detail.",
  C1: "Advanced: demanding texts with implicit meaning.",
  C2: "Proficient: complex texts on any subject.",
};

const levelOf = (raw: string) => LEVELS.find((l) => l.toLowerCase() === raw) as CefrLevel | undefined;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const level = levelOf((await params).level);
  if (!level) return { title: "Level not found", robots: { index: false } };
  return {
    title: `${level} English lessons`,
    description: DESCRIPTIONS[level],
    alternates: { canonical: `/levels/${level.toLowerCase()}` },
  };
}

export default async function LevelPage({ params }: { params: Params }) {
  const level = levelOf((await params).level);
  if (!level) notFound();
  const data = await publicQuery(LessonListDocument, { first: 24, filter: { kind: "READING", cefrLevel: level } });
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-semibold">{level} lessons</h1>
        <p className="max-w-2xl text-lg text-muted">{DESCRIPTIONS[level]}</p>
      </header>
      <LessonList lessons={data.publishedResources.nodes} empty={`No ${level} lessons yet. More are on their way.`} />
    </div>
  );
}
