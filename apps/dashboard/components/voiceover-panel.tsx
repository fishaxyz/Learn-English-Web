"use client";

import type { AudioTrackFieldsFragment } from "@english/graphql";
import { useCallback, useEffect, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import type { VoiceText } from "../lib/voice-text";
import { confirmCost, type Catalog } from "./voice-picker";
import { costOf, initialChoice, problemOf, resolved, VoiceSettings } from "./voice-settings";

const STATUS: Record<AudioTrackFieldsFragment["status"], { label: string; tone: string }> = {
  GENERATING: { label: "Being made…", tone: "bg-line/60 text-ink" },
  READY: { label: "Ready to check", tone: "bg-sun text-on-pastel" },
  APPROVED: { label: "Approved", tone: "bg-good-soft text-good" },
  FAILED: { label: "Failed", tone: "bg-bad-soft text-bad" },
};

/**
 * Voice-overs for the draft: choose voices (filtered by man/woman and US/UK), see what it costs before anything is
 * made, then listen to each one and approve it. Only approved voice-overs are published.
 */
export function VoiceoverPanel({
  resourceId,
  localizationId,
  siteId,
  editable,
  textSaved,
  text,
  speakerNames,
  initial,
  initialError,
}: {
  resourceId: string;
  localizationId: string;
  siteId: string;
  editable: boolean;
  /** The text must be saved first: voice-overs read the saved text. */
  textSaved: boolean;
  /** What a voice-over of the saved text reads. */
  text: VoiceText;
  /** The draft's host names, to start the podcast settings with. */
  speakerNames?: { host1?: string | null; host2?: string | null } | null;
  initial: AudioTrackFieldsFragment[];
  /** A problem starting voice-overs when the lesson was created. */
  initialError?: string | null;
}) {
  const [tracks, setTracks] = useState(initial);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [choice, setChoice] = useState(() => initialChoice(speakerNames));
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(
    initialError ? { tone: "bad", text: `The voice-overs weren't started: ${initialError}` } : null
  );
  const [pending, start] = useTransition();

  const refresh = useCallback(async () => {
    const r = await actions.draftTracks(resourceId);
    if (r.ok) setTracks(r.tracks);
  }, [resourceId]);

  // While any voice-over is being made, check every few seconds.
  const generating = tracks.some((t) => t.status === "GENERATING");
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [generating, refresh]);

  const sent = resolved(choice, catalog);
  const cost = costOf(sent, text);
  const problem = problemOf(sent, text);

  function generate() {
    if (!confirmCost(catalog, cost.count > 1 ? `${cost.count} voice-overs` : cost.what, cost.characters)) return;
    start(async () => {
      const r =
        sent.mode === "conversation"
          ? await actions.requestConversation({
              localizationId,
              modelId: sent.modelId,
              host1: { voiceId: sent.host1.voiceId, name: sent.host1.name || null },
              host2: { voiceId: sent.host2.voiceId, name: sent.host2.name || null },
            })
          : await actions.requestVoiceovers(localizationId, sent.voices);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      setChoice({ ...sent, voices: [] });
      setMessage({ tone: "good", text: "Started. Each voice-over takes a few seconds to a few minutes." });
      await refresh();
    });
  }

  function act(work: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    start(async () => {
      const r = await work();
      setMessage(r.ok ? { tone: "good", text: done } : { tone: "bad", text: r.message ?? "Something went wrong." });
      await refresh();
    });
  }

  return (
    <section aria-labelledby="voice-heading" className="flex flex-col gap-4">
      <h2 id="voice-heading" className="font-display text-2xl font-semibold">
        Voice-over
      </h2>

      {tracks.length ? (
        <ul className="flex flex-col gap-3">
          {tracks.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t.label}</span>
                <span className="text-sm text-muted">{t.voiceName}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[t.status].tone}`}>
                  {STATUS[t.status].label}
                </span>
                {t.durationMs ? <span className="text-sm text-muted">{Math.round(t.durationMs / 1000)} s</span> : null}
              </div>
              {t.stale ? (
                <p className="text-sm text-bad">
                  The text changed after this was made. Make a new voice-over, or delete this one.
                </p>
              ) : null}
              {t.error ? <p className="text-sm text-bad">{t.error}</p> : null}
              {t.url ? (
                <audio controls preload="none" src={t.url} className="w-full" aria-label={`Listen: ${t.label}`} />
              ) : null}
              {editable ? (
                <div className="flex flex-wrap gap-2">
                  {t.status === "READY" && !t.stale ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => actions.approveTrack(t.id), `Approved ${t.label}.`)}
                      className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
                    >
                      Approve
                    </button>
                  ) : null}
                  {t.status !== "GENERATING" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Delete the ${t.label} voice-over?`))
                          act(() => actions.deleteTrack(t.id), "Deleted.");
                      }}
                      className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-bad hover:text-bad disabled:opacity-50"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No voice-overs yet.</p>
      )}

      {editable ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line p-4">
          <h3 className="font-semibold">Make a voice-over</h3>
          {!textSaved ? (
            <p className="text-sm text-bad">Save the text first: voice-overs read the saved text.</p>
          ) : null}
          <VoiceSettings siteId={siteId} text={text} value={choice} onChange={setChoice} onCatalog={setCatalog} />
          {textSaved && problem && (sent.mode === "conversation" || sent.voices.length) ? (
            <p className="text-sm text-bad">{problem}</p>
          ) : null}
          {catalog ? (
            <button
              type="button"
              onClick={generate}
              disabled={pending || !textSaved || !!problem}
              className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
            >
              {pending ? "Starting…" : sent.mode === "conversation" ? "Make the podcast" : "Make voice-over"}
            </button>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className={`text-sm ${message?.tone === "bad" ? "text-bad" : "text-good"}`}>
        {message?.text}
      </p>
    </section>
  );
}
