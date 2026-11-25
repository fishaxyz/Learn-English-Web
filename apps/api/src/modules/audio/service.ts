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
import type { VoiceCatalog } from "../tts/voices";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const { audioTracks: tracks, resourceRevisions: rev, resourceLocalizations: loc } = schema;

export const TTS_JOB = "tts.generate";
/** One request per track: providers cap request length (ElevenLabs: 10,000 characters for most models). */
export const MAX_TTS_CHARACTERS = 9_500;
export const MAX_VOICES_PER_REQUEST = 4;
export const MAX_TRACKS_PER_REVISION = 8;

/**
 * What a voice reads: each block's text, separated by blank lines, and where each block starts (in code points)
 * so the worker can turn the provider's character timings back into block offsets.
 */
export function ttsTextOf(doc: RichTextDocument) {
  const blocks: { blockId: string; start: number; length: number }[] = [];
  const parts: string[] = [];
  let offset = 0;
  for (const [blockId, text] of blockTexts(doc)) {
    if (!text.trim()) continue;
    if (parts.length) offset += 2; // the "\n\n" between blocks
    const length = [...text].length;
    blocks.push({ blockId, start: offset, length });
    parts.push(text);
    offset += length;
  }
  const text = parts.join("\n\n");
  return { text, blocks, characters: [...text].length, hash: createHash("sha256").update(text).digest("hex") };
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
          payload: { trackId: track.id, voiceId: voice.id, text: tts.text, blocks: tts.blocks },
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
      model_id, characters, text_hash, word_timings, duration_ms, position, created_by)
    select site_id, ${toRevisionId}, asset_id, status, provider, voice_id, voice_name, gender, accent,
      model_id, characters, text_hash, word_timings, duration_ms, position, created_by
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
