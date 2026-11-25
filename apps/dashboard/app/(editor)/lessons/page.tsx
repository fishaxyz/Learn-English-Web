import { EditorialListDocument, EditorTopicsDocument } from "@english/graphql";
import type { Metadata } from "next";
import { ReadingLibrary } from "../../../components/reading-library";
import { editorQuery } from "../../../lib/api";
import { serverEnv } from "../../../lib/env";
import { readingRows } from "../../../lib/readings";
import { can, getViewer, membershipFor } from "../../../lib/viewer";

export const metadata: Metadata = { title: "Reading Library" };

export default async function ReadingLibraryPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const viewer = await getViewer();
  const membership = membershipFor(viewer, (await searchParams).site);
  const [{ editorialResources }, { topics }] = await Promise.all([
    editorQuery(EditorialListDocument, { siteId: membership.site.id }),
    editorQuery(EditorTopicsDocument, {}, membership.site.domain),
  ]);
  return (
    <ReadingLibrary
      rows={readingRows(editorialResources)}
      topics={topics}
      newHref={can.write(membership.role) ? `/lessons/new?site=${membership.site.id}` : null}
      websiteUrl={serverEnv().WEBSITE_URL}
    />
  );
}
