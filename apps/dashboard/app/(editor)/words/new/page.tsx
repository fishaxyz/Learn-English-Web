import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SenseForm } from "../../../../components/sense-form";
import { can, getViewer, membershipFor } from "../../../../lib/viewer";

export const metadata: Metadata = { title: "New word or structure" };

export default async function NewWord({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; headword?: string }>;
}) {
  const viewer = await getViewer();
  const { site, headword } = await searchParams;
  const membership = membershipFor(viewer, site);
  if (!can.write(membership.role)) redirect("/words");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted">{membership.site.name} · Word bank</p>
        <h1 className="font-display text-3xl font-semibold">New word or structure</h1>
      </div>
      <SenseForm
        siteId={membership.site.id}
        initialHeadword={headword?.slice(0, 120) ?? ""}
        canWrite
        canPublish={can.review(membership.role)}
      />
    </div>
  );
}
