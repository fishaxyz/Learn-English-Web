import { EditorialLessonDocument, EditorTopicsDocument } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "../../../../components/status";
import { LessonEditor } from "../../../../components/lesson-editor";
import { editorQuery } from "../../../../lib/api";
import { serverEnv } from "../../../../lib/env";
import { getViewer, roleOn } from "../../../../lib/viewer";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = { title: "Edit lesson" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function EditLesson({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ voiceError?: string }>;
}) {
  const { id } = await params;
  // Set by "Create draft" when the chosen voice-overs couldn't be started; shown as plain text.
  const voiceError = (await searchParams).voiceError?.slice(0, 300) ?? null;
  if (!UUID.test(id)) notFound();
  const viewer = await getViewer();
  const { editorialResource: lesson } = await editorQuery(EditorialLessonDocument, { id });
  if (!lesson) notFound();
  const localization = lesson.localizations[0];
  if (!localization) notFound();
  const { topics } = await editorQuery(EditorTopicsDocument, {}, lesson.site.domain);
  const title = localization.draft?.title ?? localization.published?.title ?? "Untitled";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/?site=${lesson.site.id}`} className="text-sm text-accent hover:underline">
          ← All lessons
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          <StatusChip archivedAt={lesson.archivedAt} localization={localization} />
        </div>
        <p className="font-mono text-sm text-muted">/reading/{localization.slug}</p>
      </div>
      <LessonEditor
        // A fresh editor when the draft itself changes (started, published), not on every save.
        key={localization.draft?.id ?? "none"}
        lesson={lesson}
        localization={localization}
        role={roleOn(viewer, lesson.site.id)}
        topics={topics}
        websiteUrl={serverEnv().WEBSITE_URL}
        voiceError={voiceError}
      />
    </div>
  );
}
