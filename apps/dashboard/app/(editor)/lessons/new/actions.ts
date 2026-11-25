"use server";

import { CreateResourceDocument, RequestVoiceoversDocument, type CefrLevel, type ResourceKind } from "@english/graphql";
import { redirect } from "next/navigation";
import { editorMutation, explain } from "../../../../lib/api";
import { scriptToDoc } from "../../../../lib/script";

export type CreateState = { message: string } | null;

// Essays are Reading lessons: that's the kind the website shows (Listening and Vocabulary pages come later).
const KINDS: ResourceKind[] = ["READING"];
const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const MAX_SCRIPT = 50_000;

export async function createLesson(_: CreateState, form: FormData): Promise<CreateState> {
  const kind = String(form.get("kind")) as ResourceKind;
  const level = String(form.get("level") ?? "");
  const input = {
    siteId: String(form.get("siteId") ?? ""),
    kind: KINDS.includes(kind) ? kind : "READING",
    slug: String(form.get("slug") ?? "").trim(),
    title: String(form.get("title") ?? "").trim(),
    cefrLevel: LEVELS.includes(level as CefrLevel) ? (level as CefrLevel) : null,
    body: scriptToDoc(String(form.get("script") ?? "").slice(0, MAX_SCRIPT)),
  };
  const voiceIds = [...new Set(form.getAll("voice").map(String))].slice(0, 4);
  let id: string;
  let localizationId: string | undefined;
  try {
    const created = (await editorMutation(CreateResourceDocument, { input })).createResource;
    id = created.id;
    localizationId = created.localizations[0]?.id;
  } catch (error) {
    return { message: explain(error) };
  }
  // The lesson exists now; if the voice-overs can't start, say why on its page, where they can be tried again.
  let voiceError: string | null = null;
  if (voiceIds.length && input.body && localizationId) {
    try {
      await editorMutation(RequestVoiceoversDocument, { localizationId, voiceIds });
    } catch (error) {
      voiceError = explain(error);
    }
  }
  redirect(voiceError ? `/lessons/${id}?${new URLSearchParams({ voiceError })}` : `/lessons/${id}`);
}
