import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, getViewer, membershipFor } from "../../../../lib/viewer";
import { NewLessonForm } from "./form";

export const metadata: Metadata = { title: "New reading" };

export default async function NewLesson({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const viewer = await getViewer();
  const { site } = await searchParams;
  const membership = membershipFor(viewer, site);
  if (!can.write(membership.role)) redirect("/");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted">{membership.site.name}</p>
        <h1 className="text-4xl font-medium tracking-tight">New reading</h1>
      </div>
      <NewLessonForm siteId={membership.site.id} />
    </div>
  );
}
