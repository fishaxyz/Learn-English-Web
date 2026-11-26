"use client";

import { useFollowAlong, type FollowAlong } from "../lib/reading-prefs";

const FOLLOW: { id: FollowAlong; label: string }[] = [
  { id: "word", label: "Word by word" },
  { id: "sentence", label: "Sentence by sentence" },
];

/** The reading page's side panel: settings for the reading view, remembered in this browser. */
export function ReadingSettings() {
  const [follow, setFollow] = useFollowAlong();
  return (
    <section
      aria-labelledby="reading-settings-heading"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 font-sans"
    >
      <h2 id="reading-settings-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">
        Reading settings
      </h2>
      <div className="flex flex-col gap-2">
        <p id="follow-along-label" className="text-sm font-semibold text-ink">
          Highlight while listening
        </p>
        <div
          role="radiogroup"
          aria-labelledby="follow-along-label"
          className="flex flex-col gap-1 rounded-2xl border border-line p-1"
        >
          {FOLLOW.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={follow === o.id}
              onClick={() => setFollow(o.id)}
              className="rounded-xl px-3 py-2 text-left text-sm font-medium text-ink hover:bg-paper aria-checked:bg-ink aria-checked:text-paper"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
