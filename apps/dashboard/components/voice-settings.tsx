"use client";

import { useEffect, useState } from "react";
import { voiceCatalog } from "../app/(editor)/lessons/[id]/actions";
import type { VoiceText } from "../lib/voice-text";
import {
  formatNumber,
  MAX_VOICE_CHARACTERS,
  MAX_VOICES_AT_ONCE,
  OverQuota,
  QuotaNote,
  remainingOf,
  usePreview,
  VoicePicker,
  type Catalog,
} from "./voice-picker";

export type Mode = "single" | "conversation";
export type Host = { voiceId: string; name: string };
export type VoiceChoice = { mode: Mode; voices: string[]; modelId: string; host1: Host; host2: Host };

export const SINGLE_MODEL_LABEL = "Multilingual v2";
export const CONVERSATION_MODELS = [
  { id: "eleven_v3", label: "v3" },
  { id: "eleven_v3_conversational", label: "v3 Conversational" },
];
/** The longest turn the dialogue endpoint takes in one request (the API's MAX_DIALOGUE_PART). */
export const MAX_TURN_CHARACTERS = 2000;

/** The Ditto Talks English podcast hosts: the default voices for host 1 and host 2. */
const DITTO_HOSTS = { host1: "DODLEQrClDo8wCz460ld", host2: "CwhRBWXzGAHq8TQ4Fs17" }; // Lauren, Roger

export const initialChoice = (names?: { host1?: string | null; host2?: string | null } | null): VoiceChoice => ({
  mode: "single",
  voices: [],
  modelId: "eleven_v3",
  host1: { voiceId: "", name: names?.host1 ?? "" },
  host2: { voiceId: "", name: names?.host2 ?? "" },
});

/** A host's voice: the one chosen, else Ditto's host if this account has it, else the first woman / man. */
function hostVoice(catalog: Catalog, chosen: string, host: 1 | 2) {
  if (chosen && catalog.voices.some((v) => v.id === chosen)) return chosen;
  const ditto = host === 1 ? DITTO_HOSTS.host1 : DITTO_HOSTS.host2;
  if (catalog.voices.some((v) => v.id === ditto)) return ditto;
  const gender = host === 1 ? "FEMALE" : "MALE";
  return (catalog.voices.find((v) => v.gender === gender) ?? catalog.voices[0])?.id ?? "";
}

/** The choice with every host voice filled in, as it will be sent. */
export function resolved(choice: VoiceChoice, catalog: Catalog | null): VoiceChoice {
  if (!catalog) return choice;
  return {
    ...choice,
    host1: { ...choice.host1, voiceId: hostVoice(catalog, choice.host1.voiceId, 1) },
    host2: { ...choice.host2, voiceId: hostVoice(catalog, choice.host2.voiceId, 2) },
  };
}

/** What making these voice-overs reads, in characters, and how many voice-overs it makes. */
export function costOf(choice: VoiceChoice, text: VoiceText) {
  return choice.mode === "single"
    ? { count: choice.voices.length, characters: choice.voices.length * text.single, what: "voice-over(s)" }
    : { count: 1, characters: text.conversation, what: "a conversation voice-over" };
}

/** Why these voice-overs can't be made yet, or null when they can. */
export function problemOf(choice: VoiceChoice, text: VoiceText): string | null {
  if (choice.mode === "single") {
    if (!choice.voices.length) return "Choose at least one voice.";
    if (!text.single) return "Write the text first.";
    if (text.single > MAX_VOICE_CHARACTERS) return "The text is too long for one voice-over.";
    return null;
  }
  if (!text.turns.host1 && !text.turns.host2) return "Start each line with HOST1: or HOST2:.";
  if (text.conversation > MAX_VOICE_CHARACTERS) return "The conversation is too long for one voice-over.";
  if (text.longestTurn > MAX_TURN_CHARACTERS)
    return `One turn is longer than ${formatNumber(MAX_TURN_CHARACTERS)} characters.`;
  return null;
}

const field =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent";

function HostFields({
  host,
  value,
  catalog,
  onChange,
}: {
  host: 1 | 2;
  value: Host;
  catalog: Catalog;
  onChange: (value: Host) => void;
}) {
  const play = usePreview();
  const voice = catalog.voices.find((v) => v.id === value.voiceId);
  return (
    <fieldset
      className={`flex flex-col gap-2 rounded-2xl p-3 text-on-pastel ${host === 1 ? "bg-pink/60" : "bg-sky/60"}`}
    >
      <legend className="sr-only">Host {host}</legend>
      <p className="text-xs font-semibold uppercase tracking-wider">HOST{host}</p>
      <label className="flex flex-col gap-1 text-sm">
        Name learners see
        <input
          value={value.name}
          maxLength={40}
          placeholder={host === 1 ? "e.g. Kate" : "e.g. Max"}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className={`${field} text-ink`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Voice
        <span className="flex gap-2">
          <select
            value={value.voiceId}
            onChange={(e) => onChange({ ...value, voiceId: e.target.value })}
            className={`${field} min-w-0 flex-1 text-ink`}
          >
            {catalog.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name.split(" - ")[0]} · {v.gender === "FEMALE" ? "Woman" : "Man"} · {v.accent}
              </option>
            ))}
          </select>
          {voice?.previewUrl ? (
            <button
              type="button"
              aria-label={`Hear ${voice.name}`}
              onClick={() => play(voice.previewUrl ?? "")}
              className="rounded-xl border border-line bg-surface px-3 text-ink hover:border-ink"
            >
              ▶
            </button>
          ) : null}
        </span>
      </label>
    </fieldset>
  );
}

/**
 * Voice-over settings, shared by the New lesson page and the lesson page: one voice reading the text (Multilingual
 * v2, up to four voices to compare), or a podcast-style conversation (v3) where HOST1 and HOST2 lines are read by
 * two voices, like the Ditto Talks English podcast. Shows what it costs before anything is made.
 */
export function VoiceSettings({
  siteId,
  text,
  value,
  onChange,
  onCatalog,
}: {
  siteId: string;
  text: VoiceText;
  value: VoiceChoice;
  onChange: (value: VoiceChoice) => void;
  onCatalog?: (catalog: Catalog) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void voiceCatalog(siteId).then((r) => {
      if (!r.ok) return setError(r.message);
      setCatalog(r.catalog);
      onCatalog?.(r.catalog);
    });
  }, [siteId, onCatalog]); // onCatalog is a state setter: this runs once per site

  const choice = resolved(value, catalog);
  const cost = costOf(choice, text);
  const remaining = catalog ? remainingOf(catalog) : null;
  const tab = "flex-1 rounded-full px-3 py-1.5 text-sm font-medium aria-pressed:bg-accent aria-pressed:text-on-accent";

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Voice-over mode" className="flex rounded-full border border-line bg-surface p-1">
        <button
          type="button"
          aria-pressed={value.mode === "single"}
          onClick={() => onChange({ ...choice, mode: "single" })}
          className={tab}
        >
          Single voice
        </button>
        <button
          type="button"
          aria-pressed={value.mode === "conversation"}
          onClick={() => onChange({ ...choice, mode: "conversation" })}
          className={tab}
        >
          Podcast · 2 hosts
        </button>
      </div>

      {error ? <p className="text-sm text-bad">The voices couldn&apos;t be loaded: {error}</p> : null}
      {!catalog && !error ? <p className="text-sm text-muted">Loading voices…</p> : null}

      {catalog && value.mode === "single" ? (
        <>
          <p className="text-sm text-muted">
            Model: <span className="font-medium text-ink">{SINGLE_MODEL_LABEL}</span>. One voice reads the whole text;
            choose up to {MAX_VOICES_AT_ONCE} to compare.
          </p>
          <VoicePicker
            catalog={catalog}
            characters={text.single}
            chosen={value.voices}
            onChange={(voices) => onChange({ ...choice, voices })}
          />
        </>
      ) : null}

      {catalog && value.mode === "conversation" ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Model
            <select
              value={choice.modelId}
              onChange={(e) => onChange({ ...choice, modelId: e.target.value })}
              className={field}
            >
              {CONVERSATION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.id === "eleven_v3" ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <HostFields
            host={1}
            value={choice.host1}
            catalog={catalog}
            onChange={(host1) => onChange({ ...choice, host1 })}
          />
          <HostFields
            host={2}
            value={choice.host2}
            catalog={catalog}
            onChange={(host2) => onChange({ ...choice, host2 })}
          />
          <div className="rounded-2xl border border-dashed border-line p-3 text-sm text-muted">
            <p>
              Write each line as <code className="text-ink">HOST1: …</code> or{" "}
              <code className="text-ink">HOST2: …</code>. Learners see the names above instead.
            </p>
            <p className="mt-1" aria-live="polite">
              {text.turns.host1 + text.turns.host2
                ? `${text.turns.host1} HOST1 line(s), ${text.turns.host2} HOST2 line(s) · about ${formatNumber(text.conversation)} characters`
                : "No HOST1:/HOST2: lines yet."}
              {text.otherBlocks ? ` · ${text.otherBlocks} other line(s) won't be read` : ""}
              <QuotaNote catalog={catalog} />
            </p>
          </div>
          {remaining != null && cost.characters > remaining ? <OverQuota /> : null}
        </>
      ) : null}
    </div>
  );
}
