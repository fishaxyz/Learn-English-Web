"use server";

import {
  CreateResourceDocument,
  RequestConversationVoiceoverDocument,
  RequestVoiceoversDocument,
  type CefrLevel,
  type ResourceKind,
} from "@english/graphql";
import { redirect } from "next/navigation";
import { z } from "zod";
import { editorMutation, explain } from "../../../../lib/api";

export type CreateState = { message: string } | null;

// Essays are Reading lessons: that's the kind the website shows (Listening and Vocabulary pages come later).
const KINDS: ResourceKind[] = ["READING"];
const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const MAX_BODY_BYTES = 200_000;

const host = z.object({ voiceId: z.string().max(100), name: z.string().max(40) });
/** The voice-over settings panel, as the form sends it (the API checks everything again). */
const voiceChoice = z.object({
  make: z.boolean(),
  mode: z.enum(["single", "conversation"]),
  voices: z.array(z.string().max(100)).max(4),
  modelId: z.string().max(100),
  host1: host,
  host2: host,
});

function json(value: FormDataEntryValue | null): unknown {
  const text = typeof value === "string" ? value : "";
  if (!text || text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function createLesson(_: CreateState, form: FormData): Promise<CreateState> {
  const kind = String(form.get("kind")) as ResourceKind;
  const level = String(form.get("level") ?? "");
  const parsed = voiceChoice.safeParse(json(form.get("voice")));
  const voice = parsed.success ? parsed.data : null;
  const conversation = voice?.mode === "conversation";
  const input = {
    siteId: String(form.get("siteId") ?? ""),
    kind: KINDS.includes(kind) ? kind : "READING",
    slug: String(form.get("slug") ?? "").trim(),
    title: String(form.get("title") ?? "").trim(),
    cefrLevel: LEVELS.includes(level as CefrLevel) ? (level as CefrLevel) : null,
    body: json(form.get("body")),
    // A conversation's host names are part of the lesson: learners see them instead of HOST1/HOST2.
    speakerNames: conversation ? { host1: voice.host1.name || null, host2: voice.host2.name || null } : null,
  };
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
  if (voice?.make && input.body && localizationId) {
    try {
      if (voice.mode === "conversation") {
        await editorMutation(RequestConversationVoiceoverDocument, {
          input: {
            localizationId,
            modelId: voice.modelId,
            host1: { voiceId: voice.host1.voiceId, name: voice.host1.name || null },
            host2: { voiceId: voice.host2.voiceId, name: voice.host2.name || null },
          },
        });
      } else if (voice.voices.length) {
        await editorMutation(RequestVoiceoversDocument, { localizationId, voiceIds: voice.voices });
      }
    } catch (error) {
      voiceError = explain(error);
    }
  }
  redirect(voiceError ? `/lessons/${id}?${new URLSearchParams({ voiceError })}` : `/lessons/${id}`);
}
