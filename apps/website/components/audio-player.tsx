"use client";

import type { ReadingLessonQuery } from "@english/graphql";
import { rangeForSpan } from "../lib/text-spans";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";

type Lesson = Extract<NonNullable<ReadingLessonQuery["resourceBySlug"]>, { __typename: "ReadingResource" }>;
export type Track = Lesson["audioTracks"][number];

export type PlayerHandle = {
  /** Plays the words between these code-point offsets of a block, if the current voice has timings for them. */
  playSpan(blockId: string, start: number, end: number): boolean;
};

const SPEEDS = [0.75, 1, 1.25] as const;
const HIGHLIGHT = "read-along";

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const highlights = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS
    ? (CSS as unknown as { highlights: HighlightRegistry }).highlights
    : null;

/**
 * The lesson's voice-overs: play, seek, replay, speed, and a choice of voice ("Woman · UK"). While it plays, the
 * word being spoken is highlighted in the text (read-along), using the browser's highlight API so the text itself
 * isn't re-rendered. No autoplay; nothing loads until the learner presses play (AGENTS.md §9).
 */
export const AudioPlayer = forwardRef<PlayerHandle, { tracks: Track[]; text: RefObject<HTMLElement | null> }>(
  function AudioPlayer({ tracks, text }, ref) {
    const audio = useRef<HTMLAudioElement>(null);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [now, setNow] = useState(0);
    const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
    const stopAt = useRef<number | null>(null);
    const track = tracks[index] ?? tracks[0];
    const duration = track?.durationMs ?? 0;

    const highlight = useCallback(
      (ms: number) => {
        const registry = highlights();
        const container = text.current;
        if (!registry || !container || !track) return;
        const timings = track.wordTimings;
        // The word being spoken: the last one that started at or before now.
        let lo = 0;
        let hi = timings.length - 1;
        let found = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if ((timings[mid]?.startMs ?? 0) <= ms) {
            found = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        const word = found >= 0 ? timings[found] : undefined;
        const range =
          word && ms <= word.endMs + 400 ? rangeForSpan(container, word.blockId, word.start, word.end) : null;
        const Highlight = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
        if (range && Highlight) registry.set(HIGHLIGHT, new Highlight(range));
        else registry.delete(HIGHLIGHT);
      },
      [text, track]
    );

    useEffect(() => () => highlights()?.delete(HIGHLIGHT), []);

    useImperativeHandle(ref, () => ({
      playSpan(blockId, start, end) {
        const el = audio.current;
        const words = track?.wordTimings.filter((t) => t.blockId === blockId && t.start < end && t.end > start) ?? [];
        if (!el || !words.length) return false;
        stopAt.current = words[words.length - 1]?.endMs ?? null;
        const from = (words[0]?.startMs ?? 0) / 1000;
        const go = () => {
          el.currentTime = from;
          el.playbackRate = speed;
          void el.play();
        };
        // Nothing is loaded until it's needed (preload="none"): seeking waits for the file's details.
        if (el.readyState >= HTMLMediaElement.HAVE_METADATA) go();
        else {
          el.addEventListener("loadedmetadata", go, { once: true });
          el.load();
        }
        return true;
      },
    }));

    if (!track) return null;
    const button = "rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:border-accent";

    return (
      <section
        aria-label="Listen to the text"
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 font-sans"
      >
        <audio
          ref={audio}
          src={track.url ?? undefined}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            highlights()?.delete(HIGHLIGHT);
          }}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const ms = e.currentTarget.currentTime * 1000;
            setNow(ms);
            if (stopAt.current != null && ms >= stopAt.current) {
              stopAt.current = null;
              e.currentTarget.pause();
              return;
            }
            highlight(ms);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              stopAt.current = null;
              const el = audio.current;
              if (!el) return;
              el.playbackRate = speed;
              if (el.paused) void el.play();
              else el.pause();
            }}
            className="rounded-full bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-strong"
          >
            {playing ? "❚❚ Pause" : "▶ Listen"}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => audio.current && (audio.current.currentTime = Math.max(0, audio.current.currentTime - 5))}
          >
            ↺ 5 s
          </button>
          <div role="group" aria-label="Speed" className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => {
                  setSpeed(s);
                  if (audio.current) audio.current.playbackRate = s;
                }}
                className={`${button} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent`}
              >
                {s}×
              </button>
            ))}
          </div>
          {tracks.length > 1 ? (
            <div role="group" aria-label="Voice" className="flex flex-wrap gap-1">
              {tracks.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={i === index}
                  onClick={() => {
                    audio.current?.pause();
                    setIndex(i);
                    setNow(0);
                  }}
                  className={`${button} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent`}
                >
                  🎧 {t.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted">🎧 {track.label}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-10 text-right text-sm tabular-nums text-muted">{clock(now)}</span>
          <input
            type="range"
            aria-label="Position"
            min={0}
            max={Math.max(1, duration)}
            step={100}
            value={Math.min(now, duration)}
            onChange={(e) => {
              const ms = Number(e.target.value);
              setNow(ms);
              if (audio.current) audio.current.currentTime = ms / 1000;
            }}
            className="flex-1 accent-[var(--color-accent)]"
          />
          <span className="w-10 text-sm tabular-nums text-muted">{clock(duration)}</span>
        </div>
        {track.wordTimings.length ? null : (
          <p className="text-sm text-muted">This voice has no word timings, so the text isn&apos;t highlighted.</p>
        )}
      </section>
    );
  }
);
