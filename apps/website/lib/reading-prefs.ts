"use client";

import { useSyncExternalStore } from "react";

/** How the text follows the voice-over: the word being spoken, its sentence, or both. */
export type FollowAlong = "word" | "sentence" | "combined";
/** Where translations show: under a sentence the learner taps, under every sentence or paragraph, or beside it. */
export type DisplayMode = "on-demand" | "sentence" | "paragraph" | "side-by-side";

/** What Repeat loops: the whole recording, or the sentence being spoken. */
export type RepeatMode = "recording" | "sentence";

export type ReadingPrefs = {
  follow: FollowAlong;
  repeat: RepeatMode;
  translate: boolean;
  language: string;
  display: DisplayMode;
  autoScroll: boolean;
  /** Mark words that have a dictionary card (off: plain text; taps still work). */
  showWords: boolean;
};

/** Translation languages offered (BCP 47 codes). */
export const TRANSLATION_LANGUAGES = ["vi", "fr", "de"] as const;

export const FOLLOW_LABEL: Record<FollowAlong, string> = {
  word: "Word by word",
  sentence: "Sentence by sentence",
  combined: "Combined",
};
export const REPEAT_LABEL: Record<RepeatMode, string> = {
  recording: "Whole recording",
  sentence: "Current sentence",
};
export const DISPLAY_LABEL: Record<DisplayMode, string> = {
  "on-demand": "On demand",
  sentence: "Sentence by sentence",
  paragraph: "Paragraph by paragraph",
  "side-by-side": "Side by side",
};

const KEY = "learn-english-web:reading-prefs";
const OLD_KEY = "learn-english-web:follow-along";
const DEFAULTS: ReadingPrefs = {
  follow: "word",
  repeat: "recording",
  translate: false,
  language: "vi",
  display: "sentence",
  autoScroll: true,
  showWords: true,
};
const listeners = new Set<() => void>();
let cache: ReadingPrefs | null = null;

const oneOf = <T extends string>(value: unknown, options: Record<T, string>, fallback: T): T =>
  typeof value === "string" && value in options ? (value as T) : fallback;

function read(): ReadingPrefs {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ReadingPrefs> | null;
    const oldFollow = localStorage.getItem(OLD_KEY); // the first version kept only this
    cache = {
      follow: oneOf(stored?.follow ?? oldFollow, FOLLOW_LABEL, DEFAULTS.follow),
      repeat: oneOf(stored?.repeat, REPEAT_LABEL, DEFAULTS.repeat),
      translate: typeof stored?.translate === "boolean" ? stored.translate : DEFAULTS.translate,
      language: (TRANSLATION_LANGUAGES as readonly string[]).includes(stored?.language ?? "")
        ? (stored?.language as string)
        : DEFAULTS.language,
      display: oneOf(stored?.display, DISPLAY_LABEL, DEFAULTS.display),
      autoScroll: typeof stored?.autoScroll === "boolean" ? stored.autoScroll : DEFAULTS.autoScroll,
      showWords: typeof stored?.showWords === "boolean" ? stored.showWords : DEFAULTS.showWords,
    };
  } catch {
    cache = DEFAULTS; // storage blocked (private mode) or corrupt: the defaults, never a crash
  }
  return cache;
}

function update(change: Partial<ReadingPrefs>) {
  cache = { ...read(), ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Blocked: the choice still holds for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage); // other tabs
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The learner's reading settings, remembered in this browser; the defaults on the server and first render. */
export function useReadingPrefs(): [ReadingPrefs, (change: Partial<ReadingPrefs>) => void] {
  return [useSyncExternalStore(subscribe, read, () => DEFAULTS), update];
}
