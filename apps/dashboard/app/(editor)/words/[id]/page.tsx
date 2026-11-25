import { WordBankSenseDocument } from "@english/graphql";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SenseForm } from "../../../../components/sense-form";
import { editorQuery } from "../../../../lib/api";
import { can, getViewer, roleOn } from "../../../../lib/viewer";
import { kindLabel, senseStatus } from "../../../../lib/words";

export const metadata: Metadata = { title: "Edit word" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function EditWord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const viewer = await getViewer();
  const { editorialSense: sense } = await editorQuery(WordBankSenseDocument, { id });
  if (!sense) notFound();
  const role = roleOn(viewer, sense.site.id);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/words?site=${sense.site.id}`} className="text-sm text-accent hover:underline">
          ← Word bank
        </Link>
        <h1 className="text-4xl font-medium tracking-tight">{sense.entry.displayForm}</h1>
        <p className="text-muted">
          {kindLabel(sense.entry.kind)} · {senseStatus(sense)}
          {sense.published ? ` · revision ${sense.published.revisionNo} is live` : ""}
        </p>
        {sense.draft && sense.published ? (
          <p className="text-sm text-muted">
            Texts already published keep the meaning they were published with; new links use the new one.
          </p>
        ) : null}
      </div>
      <SenseForm
        key={sense.draft?.id ?? sense.published?.id}
        siteId={sense.site.id}
        sense={sense}
        canWrite={can.write(role)}
        canPublish={can.review(role)}
      />
    </div>
  );
}
