"use server";

import {
  CreateResourceDocument,
  SlugAvailabilityDocument,
  RequestConversationVoiceoverDocument,
  RequestVoiceoversDocument,
  SaveExerciseSetsDocument,
  type CefrLevel,
} from "@english/graphql";
import { redirect } from "next/navigation";
import { z } from "zod";
import { editorMutation, editorQuery, explain } from "../../../../lib/api";

export type CreateResult = { message: string };

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const host = z.object({ voiceId: z.string().max(100), name: z.string().max(40) });

/** What the New lesson page sends: the same four parts as the lesson page (the API checks everything again). */
const newLesson = z.object({
  siteId: z.string().uuid(),
  slug: z.string().max(120),
  title: z.string().max(200),
  summary: z.string().max(1000),
  level: z.enum(LEVELS).or(z.literal("")),
  topicSlugs: z.array(z.string().max(80)).max(20),
  body: z.unknown(),
  /** Exercise sets, already turned into the API's payload by the page. */
  exercises: z.array(z.unknown()).max(20),
  voice: z.object({
    make: z.boolean(),
    mode: z.enum(["single", "conversation"]),
    voices: z.array(z.string().max(100)).max(4),
    modelId: z.string().max(100),
    host1: host,
    host2: host,
  }),
  /** Where to go once it's saved: the preview ("Save and Preview") or the lesson page ("Save script"). */
  open: z.enum(["preview", "edit"]).default("preview"),
  /** The web address was made from the title (not typed): if it's taken, a free one ("-2") is used instead. */
  autoSlug: z.boolean().default(false),
});
export type NewLesson = z.input<typeof newLesson>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** While the editor types: is this web address already used on the site, and what's a free one like it? */
export async function slugStatus(siteId: string, slug: string): Promise<{ taken: boolean; suggestion: string | null }> {
  if (!SLUG.test(slug) || slug.length > 120) return { taken: false, suggestion: null };
  try {
    const { slugAvailability: r } = await editorQuery(SlugAvailabilityDocument, { siteId, slug });
    return { taken: !r.available, suggestion: r.available ? null : r.suggestion };
  } catch {
    return { taken: false, suggestion: null }; // the save itself will say if it's taken
  }
}

export async function createLesson(raw: NewLesson): Promise<CreateResult> {
  const parsed = newLesson.safeParse(raw);
  if (!parsed.success) return { message: "Something in the form isn't valid. Check the fields and try again." };
  const input = parsed.data;
  const conversation = input.voice.mode === "conversation";
  let slug = input.slug.trim();
  if (input.autoSlug) {
    try {
      slug = (await editorQuery(SlugAvailabilityDocument, { siteId: input.siteId, slug })).slugAvailability.suggestion;
    } catch {
      // keep it: the create below says if it's taken
    }
  }

  let id: string;
  let localizationId: string | undefined;
  let lockVersion = 0;
  try {
    const created = (
      await editorMutation(CreateResourceDocument, {
        input: {
          siteId: input.siteId,
          kind: "READING",
          slug,
          title: input.title.trim(),
          summary: input.summary.trim() || null,
          cefrLevel: (input.level || null) as CefrLevel | null,
          topicSlugs: input.topicSlugs,
          body: input.body ?? null,
          // A conversation's host names are part of the lesson: learners see them instead of HOST1/HOST2.
          speakerNames: conversation
            ? { host1: input.voice.host1.name || null, host2: input.voice.host2.name || null }
            : null,
        },
      })
    ).createResource;
    id = created.id;
    localizationId = created.localizations[0]?.id;
    lockVersion = created.localizations[0]?.draft?.lockVersion ?? 0;
  } catch (error) {
    return { message: explain(error) };
  }

  const problems: string[] = [];
  if (localizationId && input.exercises.length) {
    try {
      await editorMutation(SaveExerciseSetsDocument, { localizationId, lockVersion, sets: input.exercises });
    } catch (error) {
      problems.push(`The questions weren't saved: ${explain(error)}`);
    }
  }
  const { voice } = input;
  if (localizationId && voice.make && input.body) {
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
      problems.push(explain(error));
    }
  }
  // Saved: show it as learners will see it. If a step went wrong, open the lesson page instead, which says what.
  redirect(
    problems.length
      ? `/lessons/${id}?${new URLSearchParams({ voiceError: problems.join(" ") })}`
      : input.open === "edit"
        ? `/lessons/${id}`
        : `/lessons/${id}/preview?saved=1`
  );
}
