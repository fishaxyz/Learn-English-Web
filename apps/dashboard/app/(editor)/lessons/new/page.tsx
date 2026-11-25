import { EditorTopicsDocument } from "@english/graphql";
import type { Metadata } from "next";
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
    <NewLessonForm
      site={{ id: membership.site.id, domain: membership.site.domain }}
      siteName={membership.site.name}
      topics={topics}
    />
  );
}
