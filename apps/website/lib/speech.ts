"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * Pronunciation with the browser's own voice (free, on the device). Quality depends on the device; recorded
 * audio will replace it where editors upload some (Phase 3).
 */
export function useSpeech() {
  // False on the server and in the first render, so the page hydrates the same; then the browser's answer.
  const available = useSyncExternalStore(
    noSubscription,
    () => "speechSynthesis" in window,
    () => false
  );
  function speak(text: string, lang: "en-GB" | "en-US") {
    if (!available) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    const voice =
      synth.getVoices().find((v) => v.lang === lang) ?? synth.getVoices().find((v) => v.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  }
  return { available, speak };
}
