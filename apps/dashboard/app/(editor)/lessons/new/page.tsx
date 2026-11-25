import { EditorTopicsDocument } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { editorQuery } from "../../../../lib/api";
import { can, getViewer, membershipFor } from "../../../../lib/viewer";
import { NewLessonForm } from "./form";

export const metadata: Metadata = { title: "New reading" };

export default async function NewLesson({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const viewer = await getViewer();
  const { site } = await searchParams;
  const membership = membershipFor(viewer, site);
  if (!can.write(membership.role)) redirect("/");
  const { topics } = await editorQuery(EditorTopicsDocument, {}, membership.site.domain);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/lessons?site=${membership.site.id}`} className="text-sm text-accent hover:underline">
          ← Reading Library
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-medium tracking-tight">New reading</h1>
          <span className="rounded-full bg-line/70 px-2.5 py-0.5 text-xs font-semibold">Not saved</span>
        </div>
        <p className="text-sm text-muted">{membership.site.name}</p>
      </div>
      <NewLessonForm site={{ id: membership.site.id, domain: membership.site.domain }} topics={topics} />
    </div>
  );
}
