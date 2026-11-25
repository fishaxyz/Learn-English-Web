"use client";

import type { VoiceCatalogQuery } from "@english/graphql";
import { useEffect, useRef, useState } from "react";

export type Catalog = VoiceCatalogQuery["voiceCatalog"];
type Gender = "FEMALE" | "MALE";
type Accent = "US" | "UK";

export const MAX_VOICES_AT_ONCE = 4;
/** The longest text one voice-over can read (the API's limit). */
export const MAX_VOICE_CHARACTERS = 9500;

const tag = (gender: Gender, accent: Accent) => `${gender === "FEMALE" ? "Woman" : "Man"} · ${accent}`;
export const formatNumber = (n: number) => n.toLocaleString("en");

/** What the editor is asked before voice-overs are made: always with what they cost. */
export function confirmCost(catalog: Catalog | null, what: string, characters: number): boolean {
  return window.confirm(
    catalog?.provider === "fake"
      ? `Make ${what}? (No ElevenLabs key is set: test voice-overs are silent.)`
      : `Make ${what}? This uses about ${formatNumber(characters)} ElevenLabs characters.`
  );
}

/**
 * Choose voices for a voice-over: filter by man/woman and US/UK, hear a sample, pick up to four, and see the cost
 * (characters per voice × voices) and what's left this month before anything is made.
 */
export function VoicePicker({
  catalog,
  characters,
  chosen,
  onChange,
}: {
  catalog: Catalog;
  /** About how many characters one voice-over of the text uses. */
  characters: number;
  chosen: string[];
  onChange: (voiceIds: string[]) => void;
}) {
  const [gender, setGender] = useState<Gender | null>(null);
  const [accent, setAccent] = useState<Accent | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => preview.current?.pause(), []);

  const voices = catalog.voices.filter((v) => (!gender || v.gender === gender) && (!accent || v.accent === accent));
  const cost = chosen.length * characters;
  const remaining = remainingOf(catalog);
  const chip =
    "rounded-full border border-line px-3 py-1 text-sm aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent";

  return (
    <div className="flex flex-col gap-3">
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
      <ul className="grid max-h-72 gap-1 overflow-y-auto">
        {voices.map((v) => {
          const on = chosen.includes(v.id);
          return (
            <li key={v.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
              <input
                id={`voice-${v.id}`}
                type="checkbox"
                checked={on}
                disabled={!on && chosen.length >= MAX_VOICES_AT_ONCE}
                onChange={() => onChange(on ? chosen.filter((x) => x !== v.id) : [...chosen, v.id])}
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
      <p className="text-sm text-muted" aria-live="polite">
        {chosen.length
          ? `${chosen.length} chosen · about ${formatNumber(cost)} characters (${formatNumber(characters)} per voice)`
          : `Choose up to ${MAX_VOICES_AT_ONCE} voices.`}
        <QuotaNote catalog={catalog} />
      </p>
      {remaining != null && cost > remaining ? <OverQuota /> : null}
      {characters > MAX_VOICE_CHARACTERS ? (
        <p className="text-sm text-bad">
          The text is too long for one voice-over ({formatNumber(characters)} of {formatNumber(MAX_VOICE_CHARACTERS)}{" "}
          characters).
        </p>
      ) : null}
    </div>
  );
}

export const remainingOf = (catalog: Catalog) =>
  catalog.charactersLimit != null && catalog.charactersUsed != null
    ? catalog.charactersLimit - catalog.charactersUsed
    : null;

/** "· 148,125 characters left this month", and test mode when there's no key. */
export function QuotaNote({ catalog }: { catalog: Catalog }) {
  const remaining = remainingOf(catalog);
  return (
    <>
      {remaining != null ? ` · ${formatNumber(remaining)} characters left this month` : ""}
      {catalog.provider === "fake" ? " · test mode: no ElevenLabs key, voice-overs are silent" : ""}
    </>
  );
}

export function OverQuota() {
  return <p className="text-sm text-bad">That&apos;s more than you have left this month.</p>;
}

/** A sample of a voice, one at a time. */
export function usePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  return (url: string) => {
    audio.current?.pause();
    audio.current = new Audio(url);
    void audio.current.play();
  };
}
