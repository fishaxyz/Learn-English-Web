import { AppError, notFound } from "../errors";
import type { GraphQLContext } from "../context";
import { authorize } from "../auth/actor";
import type { Resolvers } from "../generated/resolvers";
import type { AudioTrackModel, RevisionModel } from "../models";
import * as audio from "../modules/audio/service";
import { claimJob } from "../modules/jobs/service";
import { siteOfLocalization } from "../modules/resources/editorial";
import type { RichTextDocument } from "../modules/rich-text";
import { trackLabel } from "../modules/tts/voices";

const worker = (ctx: GraphQLContext) => {
  if (!ctx.isWorker) throw new AppError("FORBIDDEN", "Only the worker can do that");
};

const URL_TTL_SECONDS = 6 * 60 * 60;

/** The tracks learners may hear: approved, with a file. */
export async function publicTracks(ctx: GraphQLContext, revision: RevisionModel) {
  return (await ctx.loaders.audioTracksByRevision.load(revision.id)).filter(
    (t) => t.status === "APPROVED" && t.assetId
  );
}

async function onTrack(ctx: GraphQLContext, trackId: string) {
  const siteId = await audio.siteOfTrack(ctx.db, trackId);
  if (!siteId) throw notFound("Voice-over");
  return authorize(await ctx.actor(), siteId, "content.write").user.id;
}

export const audioResolvers: Resolvers = {
  Query: {
    voiceCatalog: async (_, { siteId }, ctx) => {
      authorize(await ctx.actor(), siteId, "content.read");
      const [voices, usage] = await Promise.all([ctx.voices.voices(), ctx.voices.usage()]);
      return {
        provider: ctx.voices.provider,
        voices: voices.map((v) => ({
          ...v,
          gender: v.gender === "female" ? "FEMALE" : "MALE",
          accent: v.accent === "us" ? "US" : "UK",
        })),
        charactersUsed: usage?.charactersUsed ?? null,
        charactersLimit: usage?.charactersLimit ?? null,
      };
    },
  },
  Mutation: {
    requestVoiceovers: async (_, { localizationId, voiceIds }, ctx) => {
      const siteId = await siteOfLocalization(ctx.db, localizationId);
      if (!siteId) throw notFound("Lesson");
      const actor = authorize(await ctx.actor(), siteId, "content.write");
      return audio.requestVoiceovers(ctx.db, ctx.voices, actor.user.id, localizationId, voiceIds);
    },
    approveAudioTrack: async (_, { id }, ctx) => audio.approveTrack(ctx.db, await onTrack(ctx, id), id),
    deleteAudioTrack: async (_, { id }, ctx) => audio.deleteTrack(ctx.db, await onTrack(ctx, id), id),

    claimJob: async (_, { types }, ctx) => {
      worker(ctx);
      return claimJob(ctx.db, types.slice(0, 10));
    },
    createJobUpload: async (_, { jobId, claimToken, contentType }, ctx) => {
      worker(ctx);
      return audio.createJobUpload(ctx.db, ctx.storage, jobId, claimToken, contentType);
    },
    completeJob: async (_, { jobId, claimToken, result }, ctx) => {
      worker(ctx);
      return audio.completeJob(ctx.db, jobId, claimToken, result);
    },
    failJob: async (_, { jobId, claimToken, error, retryable }, ctx) => {
      worker(ctx);
      return audio.failJob(ctx.db, jobId, claimToken, error, retryable);
    },
  },
  ClaimedJob: {
    payload: (j) => j.payloadJson,
    claimToken: (j) => j.claimToken ?? "",
    attempt: (j) => j.attempts,
  },
  AudioTrack: {
    gender: (t) => (t.gender === "female" ? "FEMALE" : "MALE"),
    accent: (t) => (t.accent === "us" ? "US" : "UK"),
    label: (t) => trackLabel(t.gender, t.accent),
    url: async (t, _, ctx) => {
      if (!t.assetId) return null;
      const asset = await ctx.loaders.mediaAsset.load(t.assetId);
      return asset ? ctx.storage.downloadUrl(asset.objectKey, URL_TTL_SECONDS) : null;
    },
    wordTimings: (t) =>
      (Array.isArray(t.wordTimings) ? (t.wordTimings as AudioTrackModel["wordTimings"] & unknown[]) : []) as never,
    stale: async (t, _, ctx) => {
      const revision = await ctx.loaders.revision.load(t.revisionId);
      if (!revision || revision.status === "PUBLISHED" || revision.status === "SUPERSEDED") return false;
      return audio.ttsTextOf(revision.richText as RichTextDocument).hash !== t.textHash;
    },
  },
};
