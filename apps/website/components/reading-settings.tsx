"use client";

import { useId } from "react";
import {
  DISPLAY_LABEL,
  FOLLOW_LABEL,
  REPEAT_LABEL,
  TRANSLATION_LANGUAGES,
  useReadingPrefs,
  type DisplayMode,
  type FollowAlong,
  type RepeatMode,
} from "../lib/reading-prefs";
import { languageName } from "../lib/languages";

const heading = "text-xs font-semibold uppercase tracking-wider text-muted";

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className={heading}>
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-1">
        {(Object.keys(options) as T[]).map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className="rounded-xl bg-paper px-3 py-2 text-left text-sm font-medium text-ink hover:bg-accent-soft aria-checked:bg-accent aria-checked:text-on-accent"
          >
            {options[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An on/off switch with its label. */
export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group flex items-center justify-between gap-3 text-left text-sm font-medium text-ink"
    >
      {label}
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors group-aria-checked:bg-accent">
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform group-aria-checked:translate-x-5" />
      </span>
    </button>
  );
}

/** Every reading setting: the side panel on wide screens, the player's Settings sheet on phones. */
export function ReadingSettingsControls() {
  const [prefs, update] = useReadingPrefs();
  const languageId = useId();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={languageId} className={heading}>
          Translation language
        </label>
        <select
          id={languageId}
          value={prefs.language}
          onChange={(e) => update({ language: e.target.value })}
          className="cursor-pointer rounded-xl border border-line bg-surface px-3 py-2 text-sm"
        >
          {TRANSLATION_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {languageName(l)}
            </option>
          ))}
        </select>
      </div>
      <Choices<DisplayMode>
        label="Display mode"
        options={DISPLAY_LABEL}
        value={prefs.display}
        onChange={(display) => update({ display, translate: true })}
      />
      <hr className="border-line" />
      <Choices<FollowAlong>
        label="Highlight while listening"
        options={FOLLOW_LABEL}
        value={prefs.follow}
        onChange={(follow) => update({ follow })}
      />
      <hr className="border-line" />
      <Choices<RepeatMode>
        label="Repeat"
        options={REPEAT_LABEL}
        value={prefs.repeat}
        onChange={(repeat) => update({ repeat })}
      />
      <hr className="border-line" />
      <Switch
        label="Auto-scroll while listening"
        on={prefs.autoScroll}
        onChange={(autoScroll) => update({ autoScroll })}
      />
    </div>
  );
}

/** The reading page's side panel. */
export function ReadingSettings() {
  return (
    <section
      aria-labelledby="reading-settings-heading"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 font-sans"
    >
      <h2 id="reading-settings-heading" className="text-lg font-semibold text-ink">
        Reading settings
      </h2>
      <ReadingSettingsControls />
    </section>
  );
}
