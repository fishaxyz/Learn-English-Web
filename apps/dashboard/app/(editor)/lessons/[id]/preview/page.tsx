import { EditorialLessonDocument } from "@english/graphql";
import { ExerciseRenderer, LessonLayout, LinkedText } from "@english/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editorQuery } from "../../../../../lib/api";
import { previewSets } from "../../../../../lib/exercises";

export const metadata: Metadata = { title: "Preview" };

/** The draft as learners will see it. Editors only, never cached, never indexed. */
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { editorialResource: lesson } = await editorQuery(EditorialLessonDocument, { id });
  const localization = lesson?.localizations[0];
  const revision = localization?.draft ?? localization?.published;
  if (!lesson || !revision) notFound();
  const draft = localization?.draft;
  return (
    <div className="flex flex-col gap-8">
      <p role="note" className="rounded-2xl bg-sun px-4 py-3 text-sm text-on-pastel">
        Preview of{" "}
        {draft ? `the ${draft.status === "IN_REVIEW" ? "draft in review" : "draft"}` : "the published lesson"}. Saved
        changes only.
      </p>
      <div className="website-look rounded-3xl bg-surface p-4 sm:p-8">
        <LessonLayout
          kind={lesson.kind}
          level={revision.cefrLevel}
          title={revision.title}
          summary={revision.summary}
          meta={revision.topics.map((t) => (
            <span key={t.slug}>{t.name}</span>
          ))}
          after={draft ? previewSets(draft.exercises).map((set) => <ExerciseRenderer key={set.id} set={set} />) : null}
        >
          <LinkedText body={revision.body} vocabulary={draft?.vocabulary ?? []} speakers={revision.speakerNames} />
        </LessonLayout>
      </div>
    </div>
  );
}
