"use client";

import type { AudioTrackFieldsFragment, VoiceCatalogQuery } from "@english/graphql";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";

type Catalog = VoiceCatalogQuery["voiceCatalog"];
type Gender = "FEMALE" | "MALE";
type Accent = "US" | "UK";

const MAX_AT_ONCE = 4;
const STATUS: Record<AudioTrackFieldsFragment["status"], { label: string; tone: string }> = {
  GENERATING: { label: "Being made…", tone: "bg-line/60 text-ink" },
  READY: { label: "Ready to check", tone: "bg-[#fdf0d5] text-[#7a4a00] dark:bg-[#3a2c10] dark:text-[#f3c770]" },
  APPROVED: { label: "Approved", tone: "bg-good-soft text-good" },
  FAILED: { label: "Failed", tone: "bg-bad-soft text-bad" },
};

const tag = (gender: Gender, accent: Accent) => `${gender === "FEMALE" ? "Woman" : "Man"} · ${accent}`;
const number = (n: number) => n.toLocaleString("en");

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
  characters,
  initial,
}: {
  resourceId: string;
  localizationId: string;
  siteId: string;
  editable: boolean;
  /** The text must be saved first: voice-overs read the saved text. */
  textSaved: boolean;
  /** About how many characters one voice-over of the saved text uses. */
  characters: number;
  initial: AudioTrackFieldsFragment[];
}) {
  const [tracks, setTracks] = useState(initial);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [accent, setAccent] = useState<Accent | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const preview = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!editable) return;
    void actions.voiceCatalog(siteId).then((r) => (r.ok ? setCatalog(r.catalog) : setCatalogError(r.message)));
  }, [editable, siteId]);

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

  const voices = (catalog?.voices ?? []).filter(
    (v) => (!gender || v.gender === gender) && (!accent || v.accent === accent)
  );
  const cost = chosen.length * characters;
  const remaining =
    catalog?.charactersLimit != null && catalog.charactersUsed != null
      ? catalog.charactersLimit - catalog.charactersUsed
      : null;

  function generate() {
    const confirmText =
      catalog?.provider === "fake"
        ? `Make ${chosen.length} test voice-over(s)? (No ElevenLabs key is set: they'll be silent.)`
        : `Make ${chosen.length} voice-over(s)? This uses about ${number(cost)} ElevenLabs characters.`;
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const r = await actions.requestVoiceovers(localizationId, chosen);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      setChosen([]);
      setMessage({ tone: "good", text: "Started. Each voice-over takes a few seconds to a minute." });
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

  const chip =
    "rounded-full border border-line px-3 py-1 text-sm aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent";

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
          {catalogError ? <p className="text-sm text-bad">The voices couldn&apos;t be loaded: {catalogError}</p> : null}
          {!catalog && !catalogError ? <p className="text-sm text-muted">Loading voices…</p> : null}
          {catalog ? (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter voices">
                {(["FEMALE", "MALE"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={gender === g}
                    onClick={() => setGender(gender === g ? null : g)}
                    className={chip}
                  >
                    {g === "FEMALE" ? "Woman" : "Man"}
                  </button>
                ))}
                <span aria-hidden="true" className="mx-1 w-px bg-line" />
                {(["US", "UK"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={accent === a}
                    onClick={() => setAccent(accent === a ? null : a)}
                    className={chip}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
                {voices.map((v) => {
                  const on = chosen.includes(v.id);
                  return (
                    <li key={v.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
                      <input
                        id={`voice-${v.id}`}
                        type="checkbox"
                        checked={on}
                        disabled={!on && chosen.length >= MAX_AT_ONCE}
                        onChange={() => setChosen(on ? chosen.filter((x) => x !== v.id) : [...chosen, v.id])}
                      />
                      <label htmlFor={`voice-${v.id}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm">
                        <span className="font-medium">{v.name}</span>{" "}
                        <span className="text-muted">{tag(v.gender, v.accent)}</span>
                      </label>
                      {v.previewUrl ? (
                        <button
                          type="button"
                          aria-label={`Hear ${v.name}`}
                          onClick={() => {
                            preview.current?.pause();
                            preview.current = new Audio(v.previewUrl ?? undefined);
                            void preview.current.play();
                          }}
                          className="rounded-full border border-line px-2 py-0.5 text-xs hover:border-accent"
                        >
                          ▶
                        </button>
                      ) : null}
                    </li>
                  );
                })}
                {!voices.length ? <li className="text-sm text-muted">No voices match these filters.</li> : null}
              </ul>
              <p className="text-sm text-muted">
                {chosen.length
                  ? `${chosen.length} chosen · about ${number(cost)} characters (${number(characters)} per voice)`
                  : `Choose up to ${MAX_AT_ONCE} voices.`}
                {remaining != null ? ` · ${number(remaining)} characters left this month` : ""}
                {catalog.provider === "fake" ? " · test mode: no ElevenLabs key, voice-overs are silent" : ""}
              </p>
              {remaining != null && cost > remaining ? (
                <p className="text-sm text-bad">That&apos;s more than you have left this month.</p>
              ) : null}
              <button
                type="button"
                onClick={generate}
                disabled={pending || !chosen.length || !textSaved || !characters}
                className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
              >
                {pending ? "Starting…" : "Make voice-over"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className={`text-sm ${message?.tone === "bad" ? "text-bad" : "text-good"}`}>
        {message?.text}
      </p>
    </section>
  );
}
