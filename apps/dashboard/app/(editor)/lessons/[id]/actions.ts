"use server";

import {
  ApproveAudioTrackDocument,
  ArchiveResourceDocument,
  DeleteAudioTrackDocument,
  DraftAudioDocument,
  RequestConversationVoiceoverDocument,
  RequestVoiceoversDocument,
  type ConversationVoiceoverInput,
  VoiceCatalogDocument,
  type AudioTrackFieldsFragment,
  type VoiceCatalogQuery,
  PublishNowDocument,
  PublishResourceDocument,
  ReturnToDraftDocument,
  SaveExerciseSetsDocument,
  SenseSearchDocument,
  StartDraftDocument,
  SubmitForReviewDocument,
  UpdateDraftDocument,
  type CefrLevel,
  type EditorialSummaryFragment,
  type SenseSearchQuery,
} from "@english/graphql";
import { editorMutation, editorQuery, explain } from "../../../../lib/api";

// Every action asks the API, which checks the editor's role and the draft's version; these only translate.
export type ActionResult = { ok: true; summary: EditorialSummaryFragment } | { ok: false; message: string };

async function attempt(work: () => Promise<EditorialSummaryFragment>): Promise<ActionResult> {
  try {
    return { ok: true, summary: await work() };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export type DraftFields = {
  title: string;
  summary: string | null;
  cefrLevel: CefrLevel | null;
  body: unknown;
  topicSlugs: string[];
};

export async function saveDraft(localizationId: string, lockVersion: number, fields: DraftFields) {
  return attempt(async () => {
    const data = await editorMutation(UpdateDraftDocument, { input: { localizationId, lockVersion, ...fields } });
    return data.updateDraft;
  });
}

export async function saveExercises(localizationId: string, lockVersion: number, sets: unknown) {
  return attempt(
    async () => (await editorMutation(SaveExerciseSetsDocument, { localizationId, lockVersion, sets })).saveExerciseSets
  );
}

export async function submitForReview(localizationId: string, lockVersion: number) {
  return attempt(
    async () => (await editorMutation(SubmitForReviewDocument, { localizationId, lockVersion })).submitForReview
  );
}

export async function returnToDraft(localizationId: string, lockVersion: number, note: string | null) {
  return attempt(
    async () => (await editorMutation(ReturnToDraftDocument, { localizationId, lockVersion, note })).returnToDraft
  );
}

export async function publish(localizationId: string, lockVersion: number) {
  return attempt(
    async () => (await editorMutation(PublishResourceDocument, { localizationId, lockVersion })).publishResource
  );
}

/** Admins and owners: draft → live in one step, without the review queue. */
export async function publishNow(localizationId: string, lockVersion: number) {
  return attempt(async () => (await editorMutation(PublishNowDocument, { localizationId, lockVersion })).publishNow);
}

export async function startDraft(localizationId: string) {
  return attempt(async () => (await editorMutation(StartDraftDocument, { localizationId })).startDraft);
}

export async function archive(resourceId: string) {
  return attempt(async () => (await editorMutation(ArchiveResourceDocument, { resourceId })).archiveResource);
}

/** Published word senses on the lesson's site, for vocabulary links. */
export async function searchSenses(siteDomain: string, query: string): Promise<SenseSearchQuery["lexicalSearch"]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  try {
    return (await editorQuery(SenseSearchDocument, { query: q }, siteDomain)).lexicalSearch;
  } catch {
    return [];
  }
}

// --- Voice-overs

export type TracksResult = { ok: true; tracks: AudioTrackFieldsFragment[] } | { ok: false; message: string };

export async function voiceCatalog(
  siteId: string
): Promise<{ ok: true; catalog: VoiceCatalogQuery["voiceCatalog"] } | { ok: false; message: string }> {
  try {
    return { ok: true, catalog: (await editorQuery(VoiceCatalogDocument, { siteId })).voiceCatalog };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export async function draftTracks(resourceId: string): Promise<TracksResult> {
  try {
    const data = await editorQuery(DraftAudioDocument, { id: resourceId });
    return { ok: true, tracks: data.editorialResource?.localizations[0]?.draft?.audioTracks ?? [] };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export async function requestVoiceovers(localizationId: string, voiceIds: string[]): Promise<TracksResult> {
  try {
    return {
      ok: true,
      tracks: (await editorMutation(RequestVoiceoversDocument, { localizationId, voiceIds })).requestVoiceovers,
    };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export async function requestConversation(input: ConversationVoiceoverInput): Promise<TracksResult> {
  try {
    return {
      ok: true,
      tracks: (await editorMutation(RequestConversationVoiceoverDocument, { input })).requestConversationVoiceover,
    };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export async function approveTrack(id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await editorMutation(ApproveAudioTrackDocument, { id });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

export async function deleteTrack(id: string): Promise<{ ok: boolean; message?: string }> {
  try {
    await editorMutation(DeleteAudioTrackDocument, { id });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}
