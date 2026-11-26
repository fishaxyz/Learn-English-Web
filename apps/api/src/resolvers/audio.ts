import { AppError, notFound } from "../errors";
import type { GraphQLContext } from "../context";
import { authorize } from "../auth/actor";
import type { Resolvers } from "../generated/resolvers";
import type { AudioTrackModel, RevisionModel } from "../models";
import * as audio from "../modules/audio/service";
import { claimJob, heldJob, jobTypeOf, renewLease } from "../modules/jobs/service";
import { completeQuestionJob, QUESTIONS_JOB } from "../modules/assessment/suggestions";
import { completeSuggestJob, VOCAB_JOB } from "../modules/lexicon/suggestions";
import { completeTranslateJob, TRANSLATE_JOB } from "../modules/translations/service";
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
    requestConversationVoiceover: async (_, { input }, ctx) => {
      const siteId = await siteOfLocalization(ctx.db, input.localizationId);
      if (!siteId) throw notFound("Lesson");
      const actor = authorize(await ctx.actor(), siteId, "content.write");
      return audio.requestConversation(ctx.db, ctx.voices, actor.user.id, input);
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
      const type = await jobTypeOf(ctx.db, jobId);
      if (type === QUESTIONS_JOB) {
        return ctx.db.transaction(async (tx) => completeQuestionJob(tx, await heldJob(tx, jobId, claimToken), result));
      }
      if (type === TRANSLATE_JOB) {
        return ctx.db.transaction(async (tx) => completeTranslateJob(tx, await heldJob(tx, jobId, claimToken), result));
      }
      if (type === VOCAB_JOB) {
        return ctx.db.transaction(async (tx) => completeSuggestJob(tx, await heldJob(tx, jobId, claimToken), result));
      }
      return audio.completeJob(ctx.db, jobId, claimToken, result);
    },
    renewJobLease: async (_, { jobId, claimToken }, ctx) => {
      worker(ctx);
      return renewLease(ctx.db, jobId, claimToken);
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
    mode: (t) => (t.mode === "conversation" ? "CONVERSATION" : "SINGLE"),
    speakers: (t) =>
      Array.isArray(t.speakers) ? (t.speakers as { host: number; voiceId: string; voiceName: string }[]) : [],
    label: async (t, _, ctx) => {
      if (t.mode !== "conversation") return trackLabel(t.gender, t.accent);
      const revision = await ctx.loaders.revision.load(t.revisionId);
      const names = (revision?.speakerNames ?? {}) as { host1?: string | null; host2?: string | null };
      return `Conversation · ${names.host1 || "Host 1"} & ${names.host2 || "Host 2"}`;
    },
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
