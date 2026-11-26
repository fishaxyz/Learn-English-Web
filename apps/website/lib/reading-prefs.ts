"use client";

import { useSyncExternalStore } from "react";

/** How the text follows the voice-over: the word being spoken, or the whole sentence. */
export type FollowAlong = "word" | "sentence";

const KEY = "learn-english-web:follow-along";
const DEFAULT: FollowAlong = "word";
const listeners = new Set<() => void>();
let cache: FollowAlong | null = null;

function read(): FollowAlong {
  if (cache) return cache;
  try {
    const stored = localStorage.getItem(KEY);
    cache = stored === "sentence" || stored === "word" ? stored : DEFAULT;
  } catch {
    cache = DEFAULT; // storage blocked (private mode): the default, never a crash
  }
  return cache;
}

function write(next: FollowAlong) {
  cache = next;
  try {
    localStorage.setItem(KEY, next);
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

/** The learner's follow-along choice, remembered in this browser; the default on the server and first render. */
export function useFollowAlong(): [FollowAlong, (next: FollowAlong) => void] {
  return [useSyncExternalStore(subscribe, read, () => DEFAULT), write];
}
