import { createHash, randomBytes } from "node:crypto";
import { schema, type Database } from "@english/database";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { conflict, invalid, notFound, translateDbErrors } from "../../errors";
import { one } from "../../rows";
import { audit } from "../audit";
import { enqueue, heldJob, markFailed, markSucceeded, type JobRow } from "../jobs/service";
import { contentTypeFor, type MediaStorage } from "../media/storage";
import { blockTexts, type RichTextDocument } from "../rich-text";
import type { Voice, VoiceCatalog } from "../tts/voices";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const { audioTracks: tracks, resourceRevisions: rev, resourceLocalizations: loc } = schema;

export const TTS_JOB = "tts.generate";
/** One request per track: providers cap request length (ElevenLabs: 10,000 characters for most models). */
export const MAX_TTS_CHARACTERS = 9_500;
export const MAX_VOICES_PER_REQUEST = 4;
export const MAX_TRACKS_PER_REVISION = 8;

/** Models per mode: single voices use Multilingual v2; conversations need a model that supports dialogue. */
export const SINGLE_MODEL = "eleven_multilingual_v2";
export const CONVERSATION_MODELS = ["eleven_v3", "eleven_v3_conversational"] as const;
export const DEFAULT_CONVERSATION_MODEL = "eleven_v3";
/** Conversations are sent in parts of at most this many characters (the dialogue endpoint's practical limit). */
export const MAX_DIALOGUE_PART = 2_000;

/** A conversation turn starts with "HOST1:" or "HOST2:"; that label is never read aloud. */
const HOST_PREFIX = /^\s*HOST\s?([12])\s*:\s*/i;

/**
 * What a voice reads: each block's text, separated by blank lines, and where each block starts (in code points)
 * so the worker can turn the provider's character timings back into block offsets. A "HOST1:"/"HOST2:" label is
 * left out of what's read; `offset` says how many code points it took at the start of the block, and `host`
 * whose turn the block is.
 */
export function ttsTextOf(doc: RichTextDocument) {
  const blocks: { blockId: string; start: number; length: number; offset: number; host: 1 | 2 | null }[] = [];
  const parts: string[] = [];
  let position = 0;
  for (const [blockId, raw] of blockTexts(doc)) {
    const label = HOST_PREFIX.exec(raw);
    const text = label ? raw.slice(label[0].length) : raw;
    if (!text.trim()) continue;
    if (parts.length) position += 2; // the "\n\n" between blocks
    const length = [...text].length;
    blocks.push({
      blockId,
      start: position,
      length,
      offset: label ? [...label[0]].length : 0,
      host: label ? (label[1] === "1" ? 1 : 2) : null,
    });
    parts.push(text);
    position += length;
  }
  const text = parts.join("\n\n");
  return { text, blocks, characters: [...text].length, hash: createHash("sha256").update(text).digest("hex") };
}

/** A conversation's turns, in order: each host block's text and where it is. Blocks without a host aren't read. */
export function conversationOf(doc: RichTextDocument) {
  const tts = ttsTextOf(doc);
  const chars = [...tts.text];
  const turns = tts.blocks
    .filter((b) => b.host)
    .map((b) => ({
      host: b.host as 1 | 2,
      blockId: b.blockId,
      offset: b.offset,
      text: chars.slice(b.start, b.start + b.length).join(""),
    }));
  return { turns, characters: turns.reduce((n, t) => n + [...t.text].length, 0), hash: tts.hash };
}

const SPEAKER_NAME = /^[\p{L}\p{M}' .-]{1,40}$/u;
/** Host names as learners see them; blank names fall back to "Host 1" / "Host 2" on the website. */
export function parseSpeakerNames(input: { host1?: string | null; host2?: string | null } | null | undefined) {
  if (!input) return null;
  const clean = (name: string | null | undefined) => {
    const n = (name ?? "").trim();
    if (n && !SPEAKER_NAME.test(n)) throw invalid("A host's name can use letters, spaces, apostrophes and hyphens");
    return n || null;
  };
  const names = { host1: clean(input.host1), host2: clean(input.host2) };
  return names.host1 || names.host2 ? names : null;
}

async function draftFor(tx: Tx | Database, localizationId: string) {
  const [l] = await tx.select().from(loc).where(eq(loc.id, localizationId)).limit(1);
  if (!l) throw notFound("Lesson");
  if (!l.draftRevisionId) throw conflict("There's no draft: start one first");
  const [draft] = await tx.select().from(rev).where(eq(rev.id, l.draftRevisionId));
  if (!draft) throw notFound("Draft");
  if (draft.status !== "DRAFT") throw conflict("The draft is in review; a reviewer must return it first");
  return { localization: l, draft };
}

/** Starts a voice-over for each chosen voice: one track and one background job per voice. */
export async function requestVoiceovers(
  db: Database,
  catalog: VoiceCatalog,
  actorUserId: string | null,
  localizationId: string,
  voiceIds: string[]
) {
  const unique = [...new Set(voiceIds)];
  if (!unique.length) throw invalid("Choose at least one voice");
  if (unique.length > MAX_VOICES_PER_REQUEST)
    throw invalid(`Choose at most ${MAX_VOICES_PER_REQUEST} voices at a time`);
  const available = await catalog.voices();
  const chosen = unique.map((id) => {
    const voice = available.find((v) => v.id === id);
    if (!voice) throw invalid("That voice isn't available");
    return voice;
  });

  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const { localization, draft } = await draftFor(tx, localizationId);
      const tts = ttsTextOf(draft.richText as RichTextDocument);
      if (!tts.characters) throw invalid("Write the text before making a voice-over");
      if (tts.characters > MAX_TTS_CHARACTERS) {
        throw invalid(`The text is ${tts.characters} characters; a voice-over can read at most ${MAX_TTS_CHARACTERS}`);
      }
      const existing = await tx.select({ id: tracks.id }).from(tracks).where(eq(tracks.revisionId, draft.id));
      if (existing.length + chosen.length > MAX_TRACKS_PER_REVISION) {
        throw invalid(`A lesson can have at most ${MAX_TRACKS_PER_REVISION} voice-overs; delete some first`);
      }
      const created = [];
      for (const [i, voice] of chosen.entries()) {
        const track = one(
          await tx
            .insert(tracks)
            .values({
              siteId: draft.siteId,
              revisionId: draft.id,
              provider: catalog.provider,
              voiceId: voice.id,
              voiceName: voice.name,
              gender: voice.gender,
              accent: voice.accent,
              modelId: SINGLE_MODEL,
              characters: tts.characters,
              textHash: tts.hash,
              position: existing.length + i,
              createdBy: actorUserId,
            })
            .returning()
        );
        const job = await enqueue(tx, {
          siteId: draft.siteId,
          type: TTS_JOB,
          idempotencyKey: `tts:${track.id}`,
          createdBy: actorUserId,
          payload: {
            mode: "single",
            trackId: track.id,
            voiceId: voice.id,
            modelId: SINGLE_MODEL,
            text: tts.text,
            blocks: tts.blocks,
          },
        });
        await tx
          .update(tracks)
          .set({ jobId: job?.id ?? null })
          .where(eq(tracks.id, track.id));
        created.push({ ...track, jobId: job?.id ?? null });
      }
      await audit(tx, {
        siteId: draft.siteId,
        actorUserId,
        action: "voiceover.requested",
        entityType: "revision",
        entityId: draft.id,
        data: {
          voices: chosen.map((v) => v.id),
          characters: tts.characters * chosen.length,
          localization: localization.id,
        },
      });
      return created;
    })
  );
}

/**
 * Starts one conversation voice-over: each HOST1/HOST2 turn read by that host's voice, in one audio file (the
 * worker uses the provider's dialogue endpoint). The host names are saved on the draft for learners to see.
 */
export async function requestConversation(
  db: Database,
  catalog: VoiceCatalog,
  actorUserId: string | null,
  input: {
    localizationId: string;
    modelId: string;
    host1: { voiceId: string; name?: string | null };
    host2: { voiceId: string; name?: string | null };
  }
) {
  if (!(CONVERSATION_MODELS as readonly string[]).includes(input.modelId)) throw invalid("Choose a conversation model");
  const available = await catalog.voices();
  const [voice1, voice2] = [input.host1.voiceId, input.host2.voiceId].map((id) => {
    const voice = available.find((v) => v.id === id);
    if (!voice) throw invalid("That voice isn't available");
    return voice;
  }) as [Voice, Voice];
  const names = parseSpeakerNames({ host1: input.host1.name, host2: input.host2.name });

  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const { localization, draft } = await draftFor(tx, input.localizationId);
      const talk = conversationOf(draft.richText as RichTextDocument);
      if (!talk.turns.length) {
        throw invalid('No conversation lines: start each line with "HOST1:" or "HOST2:"');
      }
      if (talk.characters > MAX_TTS_CHARACTERS) {
        throw invalid(
          `The conversation is ${talk.characters} characters; a voice-over can read at most ${MAX_TTS_CHARACTERS}`
        );
      }
      const tooLong = talk.turns.find((t) => [...t.text].length > MAX_DIALOGUE_PART);
      if (tooLong) throw invalid(`One turn is longer than ${MAX_DIALOGUE_PART} characters; split it into two`);
      const existing = await tx.select({ id: tracks.id }).from(tracks).where(eq(tracks.revisionId, draft.id));
      if (existing.length + 1 > MAX_TRACKS_PER_REVISION) {
        throw invalid(`A lesson can have at most ${MAX_TRACKS_PER_REVISION} voice-overs; delete some first`);
      }
      // The names belong to the draft's text, not to one voice-over: saved without changing its lock version,
      // so an editor with the draft open can still save.
      await tx.update(rev).set({ speakerNames: names }).where(eq(rev.id, draft.id));
      const speakers = [
        { host: 1, voiceId: voice1.id, voiceName: voice1.name },
        { host: 2, voiceId: voice2.id, voiceName: voice2.name },
      ];
      const track = one(
        await tx
          .insert(tracks)
          .values({
            siteId: draft.siteId,
            revisionId: draft.id,
            provider: catalog.provider,
            mode: "conversation",
            speakers,
            voiceId: voice1.id,
            voiceName: `${voice1.name} & ${voice2.name}`,
            gender: voice1.gender,
            accent: voice1.accent,
            modelId: input.modelId,
            characters: talk.characters,
            textHash: talk.hash,
            position: existing.length,
            createdBy: actorUserId,
          })
          .returning()
      );
      const voiceOf = { 1: voice1.id, 2: voice2.id } as const;
      const job = await enqueue(tx, {
        siteId: draft.siteId,
        type: TTS_JOB,
        idempotencyKey: `tts:${track.id}`,
        createdBy: actorUserId,
        payload: {
          mode: "conversation",
          trackId: track.id,
          modelId: input.modelId,
          maxPartCharacters: MAX_DIALOGUE_PART,
          turns: talk.turns.map((t) => ({
            voiceId: voiceOf[t.host],
            text: t.text,
            blockId: t.blockId,
            offset: t.offset,
          })),
        },
      });
      await tx
        .update(tracks)
        .set({ jobId: job?.id ?? null })
        .where(eq(tracks.id, track.id));
      await audit(tx, {
        siteId: draft.siteId,
        actorUserId,
        action: "voiceover.requested",
        entityType: "revision",
        entityId: draft.id,
        data: {
          mode: "conversation",
          voices: [voice1.id, voice2.id],
          characters: talk.characters,
          localization: localization.id,
        },
      });
      return [{ ...track, jobId: job?.id ?? null }];
    })
  );
}

export async function siteOfTrack(db: Database, trackId: string) {
  const [row] = await db.select({ siteId: tracks.siteId }).from(tracks).where(eq(tracks.id, trackId)).limit(1);
  return row?.siteId ?? null;
}

export async function approveTrack(db: Database, actorUserId: string | null, trackId: string) {
  return db.transaction(async (tx) => {
    const [track] = await tx.select().from(tracks).where(eq(tracks.id, trackId)).for("update");
    if (!track) throw notFound("Voice-over");
    if (track.status !== "READY") throw conflict("Only a finished voice-over can be approved");
    const draft = one(await tx.select().from(rev).where(eq(rev.id, track.revisionId)));
    const tts = ttsTextOf(draft.richText as RichTextDocument);
    if (tts.hash !== track.textHash) throw conflict("The text changed after this voice-over was made: make a new one");
    const updated = one(await tx.update(tracks).set({ status: "APPROVED" }).where(eq(tracks.id, trackId)).returning());
    await audit(tx, {
      siteId: track.siteId,
      actorUserId,
      action: "voiceover.approved",
      entityType: "audio_track",
      entityId: trackId,
    });
    return updated;
  });
}

export async function deleteTrack(db: Database, actorUserId: string | null, trackId: string) {
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const [track] = await tx.delete(tracks).where(eq(tracks.id, trackId)).returning();
      if (!track) throw notFound("Voice-over");
      await audit(tx, {
        siteId: track.siteId,
        actorUserId,
        action: "voiceover.deleted",
        entityType: "audio_track",
        entityId: trackId,
      });
      return true;
    })
  );
}

/**
 * Called inside the publish transaction: unapproved voice-overs are dropped (only approved ones go live), and an
 * approved one whose text changed since it was made blocks the publish.
 */
export async function prepareTracksForPublish(tx: Tx, revisionId: string, doc: RichTextDocument) {
  await tx.delete(tracks).where(and(eq(tracks.revisionId, revisionId), ne(tracks.status, "APPROVED")));
  const hash = ttsTextOf(doc).hash;
  const stale = await tx
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(eq(tracks.revisionId, revisionId), ne(tracks.textHash, hash)));
  if (stale.length) throw conflict("The text changed after a voice-over was approved: make a new one or delete it");
}

/** A new draft keeps the approved voice-overs (same audio files; the published ones stay frozen). */
export async function copyTracks(tx: Tx, fromRevisionId: string, toRevisionId: string) {
  await tx.execute(sql`
    insert into audio_tracks (site_id, revision_id, asset_id, status, provider, voice_id, voice_name, gender, accent,
      mode, speakers, model_id, characters, text_hash, word_timings, duration_ms, position, created_by)
    select site_id, ${toRevisionId}, asset_id, status, provider, voice_id, voice_name, gender, accent,
      mode, speakers, model_id, characters, text_hash, word_timings, duration_ms, position, created_by
    from audio_tracks where revision_id = ${fromRevisionId} and status = 'APPROVED'`);
}

// --- The worker's side

const wordTiming = z.strictObject({
  blockId: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
});

export const ttsResult = z.strictObject({
  objectKey: z.string(),
  mimeType: z.enum(["audio/mpeg", "audio/wav"]),
  bytes: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  durationMs: z.number().int().positive(),
  modelId: z.string().max(100).nullable(),
  /** From the provider's alignment; empty when it gave none (timings are never invented). */
  wordTimings: z.array(wordTiming).max(20_000),
});

/** An upload URL for a job's audio file, under a key only that job could have made. */
export async function createJobUpload(
  db: Database,
  storage: MediaStorage,
  jobId: string,
  claimToken: string,
  contentType: string
) {
  const job = await heldJob(db, jobId, claimToken);
  const ext = contentType === "audio/mpeg" ? "mp3" : contentType === "audio/wav" ? "wav" : null;
  if (!ext || job.type !== TTS_JOB) throw invalid("Unsupported upload");
  const trackId = (job.payloadJson as { trackId: string }).trackId;
  const objectKey = `${job.siteId}/audio/${trackId}-${randomBytes(6).toString("hex")}.${ext}`;
  return { objectKey, uploadUrl: storage.uploadUrl(objectKey, contentTypeFor(ext), 900) };
}

/** The worker finished: register the file, fill in the track. Idempotent through the job's claim token. */
export async function completeJob(db: Database, jobId: string, claimToken: string, result: unknown) {
  return translateDbErrors(() =>
    db.transaction(async (tx) => {
      const job = await heldJob(tx, jobId, claimToken);
      if (job.type !== TTS_JOB) throw invalid("Unknown job type");
      const parsed = ttsResult.safeParse(result);
      if (!parsed.success) throw invalid("The job's result isn't valid");
      const r = parsed.data;
      if (!r.objectKey.startsWith(`${job.siteId}/audio/`)) throw invalid("The file isn't this job's");
      const trackId = (job.payloadJson as { trackId: string }).trackId;
      const asset = one(
        await tx
          .insert(schema.mediaAssets)
          .values({
            siteId: job.siteId,
            objectKey: r.objectKey,
            mimeType: r.mimeType,
            checksumSha256: r.checksumSha256,
            bytes: r.bytes,
            durationMs: r.durationMs,
            status: "READY",
            source: "tts",
          })
          .returning()
      );
      // The track may have been deleted meanwhile (the editor changed their mind): the file is then unused.
      await tx
        .update(tracks)
        .set({
          status: "READY",
          assetId: asset.id,
          durationMs: r.durationMs,
          wordTimings: r.wordTimings,
          modelId: r.modelId,
          error: null,
        })
        .where(and(eq(tracks.id, trackId), eq(tracks.status, "GENERATING")));
      await markSucceeded(tx, job, { trackId, assetId: asset.id });
      return true;
    })
  );
}

export async function failJob(db: Database, jobId: string, claimToken: string, error: string, retryable: boolean) {
  return db.transaction(async (tx) => {
    const job: JobRow = await heldJob(tx, jobId, claimToken);
    const final = await markFailed(tx, job, error, retryable);
    if (final && job.type === TTS_JOB) {
      const trackId = (job.payloadJson as { trackId: string }).trackId;
      await tx
        .update(tracks)
        .set({ status: "FAILED", error: "The voice-over couldn't be made. Try again, or choose another voice." })
        .where(and(eq(tracks.id, trackId), inArray(tracks.status, ["GENERATING"])));
    }
    return true;
  });
}
