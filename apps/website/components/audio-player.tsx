"use client";

import type { ReadingLessonQuery } from "@english/graphql";
import { FOLLOW_LABEL, REPEAT_LABEL, useReadingPrefs, type FollowAlong } from "../lib/reading-prefs";
import { blockById, blockText, rangeForSpan, sentenceAt } from "../lib/text-spans";
import { VoiceTags } from "./voice-tags";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type Lesson = Extract<NonNullable<ReadingLessonQuery["resourceBySlug"]>, { __typename: "ReadingResource" }>;
export type Track = Lesson["audioTracks"][number];

export type PlayerHandle = {
  /** Plays the words between these code-point offsets of a block, if the current voice has timings for them. */
  playSpan(blockId: string, start: number, end: number): boolean;
};

type Speed = 1 | 0.75;
const SPEED_LABEL: Record<Speed, string> = { 0.75: "Slower Speed", 1: "Natural Speed" };
const FOLLOW_ORDER: FollowAlong[] = ["word", "sentence", "combined"];
const FOLLOW_BUTTON: Record<FollowAlong, string> = {
  word: "Word highlight",
  sentence: "Sentence highlight",
  combined: "Combined highlight",
};
const WORD = "read-along";
const SENTENCE = "read-along-sentence";
/** The bar's height, so auto-scroll keeps the spoken sentence above it. */
const BAR_SPACE = 120;

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const highlights = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS
    ? (CSS as unknown as { highlights: HighlightRegistry }).highlights
    : null;
const clearHighlights = () => {
  highlights()?.delete(WORD);
  highlights()?.delete(SENTENCE);
};

/**
 * The lesson's voice-overs, in a bar fixed to the bottom of the screen: play, seek, speed, highlight style,
 * repeat, and a choice of voice ("Woman · UK"). While it plays, the word being spoken, its sentence, or both (the
 * learner's choice) are highlighted in the text with the browser's highlight API, so the text isn't re-rendered;
 * with auto-scroll on, the page follows the voice. No autoplay; nothing loads until the learner presses play
 * (AGENTS.md §9).
 */
export const AudioPlayer = forwardRef<
  PlayerHandle,
  {
    tracks: Track[];
    text: RefObject<HTMLElement | null>;
    /** The reading settings, for phones (the side panel is hidden there). */
    settings?: ReactNode;
  }
>(function AudioPlayer({ tracks, text, settings }, ref) {
  const audio = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [repeat, setRepeat] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [prefs, update] = useReadingPrefs();
  const stopAt = useRef<number | null>(null);
  const lastSentence = useRef<string | null>(null);
  /** "Current sentence" repeat: the stretch of the recording being looped. */
  const loopSpan = useRef<{ startMs: number; endMs: number } | null>(null);
  const track = tracks[index] ?? tracks[0];
  const duration = track?.durationMs ?? 0;
  const { follow, autoScroll } = prefs;
  const repeatSentence = repeat && prefs.repeat === "sentence";

  /** Where in the recording the sentence being said at `ms` starts and ends. */
  const sentenceTimesAt = useCallback(
    (ms: number) => {
      const container = text.current;
      const timings = track?.wordTimings ?? [];
      const word = [...timings].reverse().find((t) => t.startMs <= ms) ?? timings[0];
      const block = word && container ? blockById(container, word.blockId) : null;
      const sentence = word && block ? sentenceAt(blockText(block), word.start) : null;
      if (!word || !sentence) return null;
      const words = timings.filter(
        (t) => t.blockId === word.blockId && t.start >= sentence.start && t.end <= sentence.end
      );
      const first = words[0];
      const last = words[words.length - 1];
      return first && last ? { startMs: first.startMs, endMs: last.endMs } : null;
    },
    [text, track]
  );

  // A new repeat choice (or turning it off) lets go of the sentence being looped.
  useEffect(() => {
    loopSpan.current = null;
  }, [repeatSentence, track]);

  const highlight = useCallback(
    (ms: number, following: boolean) => {
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
      const Highlight = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
      const block = word ? blockById(container, word.blockId) : null;
      const sentence = word && block ? sentenceAt(blockText(block), word.start) : null;
      // A sentence stays lit through the pauses between its words; a word only while it's said.
      const next = timings[found + 1];
      const inSentence =
        !!word &&
        !!sentence &&
        (ms <= word.endMs + 400 || (next?.blockId === word.blockId && next.start < sentence.end));
      const wordRange =
        word && ms <= word.endMs + 400 ? rangeForSpan(container, word.blockId, word.start, word.end) : null;
      const sentenceRange =
        word && sentence && inSentence ? rangeForSpan(container, word.blockId, sentence.start, sentence.end) : null;

      const show = (name: string, range: Range | null, on: boolean) => {
        if (on && range && Highlight) registry.set(name, new Highlight(range));
        else registry.delete(name);
      };
      show(WORD, wordRange, follow !== "sentence");
      show(SENTENCE, sentenceRange, follow !== "word");

      // Auto-scroll: when the voice reaches a new sentence that's out of comfortable view, bring it to the middle.
      const key = word && sentence ? `${word.blockId}:${sentence.start}` : null;
      if (following && autoScroll && sentenceRange && key !== lastSentence.current) {
        const r = sentenceRange.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - BAR_SPACE) {
          window.scrollBy({ top: r.top - window.innerHeight / 3, behavior: "smooth" });
        }
      }
      lastSentence.current = key;
    },
    [text, track, follow, autoScroll]
  );

  // Changing the setting re-lights the text at once, also while paused.
  useEffect(() => {
    const el = audio.current;
    if (el && el.currentTime > 0) highlight(el.currentTime * 1000, false);
  }, [highlight]);

  useEffect(() => clearHighlights, []);

  // The bar covers the bottom of the page: leave room for it.
  useEffect(() => {
    document.body.style.paddingBottom = `${BAR_SPACE}px`;
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, []);

  useImperativeHandle(ref, () => ({
    playSpan(blockId, start, end) {
      const el = audio.current;
      const words = track?.wordTimings.filter((t) => t.blockId === blockId && t.start < end && t.end > start) ?? [];
      if (!el || !words.length) return false;
      const endMs = words[words.length - 1]?.endMs ?? null;
      // With "Current sentence" repeat on, a tapped sentence loops; otherwise it plays once.
      loopSpan.current = repeatSentence && endMs != null ? { startMs: words[0]?.startMs ?? 0, endMs } : null;
      stopAt.current = repeatSentence ? null : endMs;
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
  const button =
    "shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-ink hover:bg-paper aria-pressed:bg-accent-soft aria-pressed:text-accent";

  return (
    <section
      aria-label="Listen to the text"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 font-sans shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur"
    >
      <audio
        ref={audio}
        src={track.url ?? undefined}
        preload="none"
        loop={repeat && !repeatSentence}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          clearHighlights();
        }}
        onEnded={(e) => {
          const span = loopSpan.current;
          if (repeatSentence && span) {
            e.currentTarget.currentTime = span.startMs / 1000;
            void e.currentTarget.play();
            return;
          }
          setPlaying(false);
        }}
        onTimeUpdate={(e) => {
          const ms = e.currentTarget.currentTime * 1000;
          setNow(ms);
          if (stopAt.current != null && ms >= stopAt.current) {
            stopAt.current = null;
            e.currentTarget.pause();
            return;
          }
          if (repeatSentence) {
            loopSpan.current ??= sentenceTimesAt(ms);
            const span = loopSpan.current;
            if (span && ms >= span.endMs) {
              e.currentTarget.currentTime = span.startMs / 1000;
              return;
            }
          }
          highlight(ms, true);
        }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Listen"}
          onClick={() => {
            stopAt.current = null;
            const el = audio.current;
            if (!el) return;
            el.playbackRate = speed;
            if (el.paused) void el.play();
            else el.pause();
          }}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-lg text-on-accent hover:bg-accent-strong"
        >
          <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
        </button>
        <div className="flex min-w-48 flex-1 items-center gap-3">
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
              loopSpan.current = null; // moving on: repeat the sentence found there
              if (audio.current) audio.current.currentTime = ms / 1000;
            }}
            className="flex-1 accent-[var(--color-accent)]"
          />
          <span className="w-10 text-sm tabular-nums text-muted">{clock(duration)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            title="Change the speed"
            onClick={() => {
              const next: Speed = speed === 1 ? 0.75 : 1;
              setSpeed(next);
              if (audio.current) audio.current.playbackRate = next;
            }}
            className={`${button} bg-paper`}
          >
            {SPEED_LABEL[speed]}
          </button>
          <button
            type="button"
            title={`Highlight while listening: ${FOLLOW_LABEL[follow]}`}
            onClick={() =>
              update({ follow: FOLLOW_ORDER[(FOLLOW_ORDER.indexOf(follow) + 1) % FOLLOW_ORDER.length] ?? "word" })
            }
            className={`${button} bg-accent-soft text-accent`}
          >
            {FOLLOW_BUTTON[follow]}
          </button>
          <button
            type="button"
            aria-pressed={repeat}
            title={`Repeat: ${REPEAT_LABEL[prefs.repeat]} (change it in Reading settings)`}
            onClick={() => setRepeat(!repeat)}
            className={button}
          >
            {repeat && repeatSentence ? "Repeat sentence" : "Repeat"}
          </button>
          {settings ? (
            <button
              type="button"
              aria-expanded={sheet}
              aria-controls="player-settings"
              onClick={() => setSheet(!sheet)}
              className={`${button} lg:hidden`}
            >
              Settings
            </button>
          ) : null}
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
                  className={`${button} border border-line`}
                >
                  <VoiceTags label={t.label} />
                </button>
              ))}
            </div>
          ) : (
            <span className="pl-2">
              <VoiceTags label={track.label} />
            </span>
          )}
        </div>
      </div>
      {track.wordTimings.length ? null : (
        <p className="mx-auto max-w-6xl px-4 pb-2 text-sm text-muted">
          This voice has no word timings, so the text isn&apos;t highlighted.
        </p>
      )}
      {settings && sheet ? (
        <div
          id="player-settings"
          className="mx-auto max-h-[60vh] max-w-6xl overflow-y-auto border-t border-line px-4 py-4 lg:hidden"
        >
          {settings}
        </div>
      ) : null}
    </section>
  );
});
