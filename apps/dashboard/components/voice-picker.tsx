"use client";

import type { VoiceCatalogQuery } from "@english/graphql";
import { useEffect, useRef, useState } from "react";
import { voiceCatalog } from "../app/(editor)/lessons/[id]/actions";

export type Catalog = VoiceCatalogQuery["voiceCatalog"];
type Gender = "FEMALE" | "MALE";
type Accent = "US" | "UK";

export const MAX_VOICES_AT_ONCE = 4;
/** The longest text one voice-over can read (the API's limit). */
export const MAX_VOICE_CHARACTERS = 9500;

const tag = (gender: Gender, accent: Accent) => `${gender === "FEMALE" ? "Woman" : "Man"} · ${accent}`;
export const formatNumber = (n: number) => n.toLocaleString("en");

/** Characters a voice reads for a rich-text document: its text blocks, joined by blank lines, in code points. */
export function voiceCharacters(doc: unknown): number {
  type Node = { type?: string; text?: string; content?: Node[] };
  const blocks: string[] = [];
  const inline = (n: Node): string =>
    n.type === "text" ? (n.text ?? "") : n.type === "hardBreak" ? "\n" : (n.content ?? []).map(inline).join("");
  const walk = (n: Node) => {
    if (n.content?.some((c) => c.type === "text" || c.type === "hardBreak")) {
      const text = inline(n);
      if (text.trim()) blocks.push(text);
      return;
    }
    n.content?.forEach(walk);
  };
  if (doc && typeof doc === "object") walk(doc as Node);
  return [...blocks.join("\n\n")].length;
}

/** What the editor is asked before voice-overs are made. */
export function confirmVoiceovers(catalog: Catalog | null, count: number, characters: number): boolean {
  return window.confirm(
    catalog?.provider === "fake"
      ? `Make ${count} test voice-over(s)? (No ElevenLabs key is set: they'll be silent.)`
      : `Make ${count} voice-over(s)? This uses about ${formatNumber(count * characters)} ElevenLabs characters.`
  );
}

/**
 * Choose voices for a voice-over: filter by man/woman and US/UK, hear a sample, pick up to four, and see the cost
 * (characters per voice × voices) and what's left this month before anything is made.
 */
export function VoicePicker({
  siteId,
  characters,
  chosen,
  onChange,
  onCatalog,
}: {
  siteId: string;
  /** About how many characters one voice-over of the text uses. */
  characters: number;
  chosen: string[];
  onChange: (voiceIds: string[]) => void;
  onCatalog?: (catalog: Catalog) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [accent, setAccent] = useState<Accent | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void voiceCatalog(siteId).then((r) => {
      if (!r.ok) return setError(r.message);
      setCatalog(r.catalog);
      onCatalog?.(r.catalog);
    });
    return () => preview.current?.pause();
  }, [siteId, onCatalog]); // onCatalog is a state setter, so this runs once per site

  if (error) return <p className="text-sm text-bad">The voices couldn&apos;t be loaded: {error}</p>;
  if (!catalog) return <p className="text-sm text-muted">Loading voices…</p>;

  const voices = catalog.voices.filter((v) => (!gender || v.gender === gender) && (!accent || v.accent === accent));
  const cost = chosen.length * characters;
  const remaining =
    catalog.charactersLimit != null && catalog.charactersUsed != null
      ? catalog.charactersLimit - catalog.charactersUsed
      : null;
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
      <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
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
        {remaining != null ? ` · ${formatNumber(remaining)} characters left this month` : ""}
        {catalog.provider === "fake" ? " · test mode: no ElevenLabs key, voice-overs are silent" : ""}
      </p>
      {remaining != null && cost > remaining ? (
        <p className="text-sm text-bad">That&apos;s more than you have left this month.</p>
      ) : null}
      {characters > MAX_VOICE_CHARACTERS ? (
        <p className="text-sm text-bad">
          The text is too long for one voice-over ({formatNumber(characters)} of {formatNumber(MAX_VOICE_CHARACTERS)}{" "}
          characters).
        </p>
      ) : null}
    </div>
  );
}
