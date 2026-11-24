"use client";

import { useSyncExternalStore } from "react";

/**
 * The learner's "to learn" list, kept in this browser only (no account yet; AGENTS.md §5.5: personal data comes
 * with accounts in Phase 5, when this list can be moved into the account). It holds words, never account data.
 * Each item is a snapshot, so "My words" works without asking the server again.
 */
export type SavedItem = {
  senseRevisionId: string;
  displayForm: string;
  kind: string;
  partOfSpeech: string;
  definition: string;
  translations: { locale: string; text: string }[];
  /** The sentence from the reading where the learner chose it. */
  sentence: string;
  /** The words as they appeared in that sentence (for structures: "likes watching"). */
  surface: string;
  lesson: { slug: string; title: string };
  addedAt: string;
};

type State = { version: 1; items: SavedItem[]; language: string | null };

const KEY = "learn-english-web:my-words";
const EMPTY: State = { version: 1, items: [], language: null };
const listeners = new Set<() => void>();
let cache: State | null = null;

function read(): State {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    cache = parsed?.version === 1 && Array.isArray(parsed.items) ? parsed : EMPTY;
  } catch {
    cache = EMPTY; // storage blocked (private mode) or corrupt: start empty, never crash
  }
  return cache;
}

function write(next: State) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the list still works for this visit.
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

/** The list and language, the same on the server and on first render (empty), then the stored ones. */
export function useMyWords() {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    items: state.items,
    language: state.language,
    has: (senseRevisionId: string) => state.items.some((i) => i.senseRevisionId === senseRevisionId),
    add: (item: SavedItem) => {
      const now = read();
      if (!now.items.some((i) => i.senseRevisionId === item.senseRevisionId))
        write({ ...now, items: [...now.items, item] });
    },
    remove: (senseRevisionId: string) => {
      const now = read();
      write({ ...now, items: now.items.filter((i) => i.senseRevisionId !== senseRevisionId) });
    },
    setLanguage: (language: string | null) => write({ ...read(), language }),
  };
}

/** A gentle suggestion, never a limit: small lists are easier to remember. */
export const SUGGESTED_PER_READING = 8;
