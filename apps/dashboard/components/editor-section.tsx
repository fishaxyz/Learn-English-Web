"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";

/**
 * Which lesson sections are collapsed, remembered in this browser only (a viewing convenience, never lesson data).
 * Read through useSyncExternalStore so the server render (all open) and the browser agree, and every section and
 * the "Collapse all" button update together.
 */
const KEY = "dashboard.lessonSections.collapsed";
const listeners = new Set<() => void>();
let memory = "";

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory; // storage blocked: remember for this page only
  }
}

function write(ids: string[]) {
  memory = ids.join(",");
  try {
    window.localStorage.setItem(KEY, memory);
  } catch {
    // storage blocked: kept in memory
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCollapsed() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const collapsed = new Set(raw.split(",").filter(Boolean));
  return {
    isOpen: (id: string) => !collapsed.has(id),
    toggle: (id: string) => write(collapsed.has(id) ? [...collapsed].filter((x) => x !== id) : [...collapsed, id]),
    open: (id: string) => write([...collapsed].filter((x) => x !== id)),
    setAll: (ids: readonly string[], open: boolean) => write(open ? [] : [...ids]),
  };
}

export type SectionState = "done" | "todo" | "unsaved" | "working" | "busy" | "attention";

const STATE: Record<SectionState, { label: string; tone: string }> = {
  done: { label: "Done", tone: "bg-good-soft text-good" },
  todo: { label: "To do", tone: "bg-line/70 text-muted" },
  unsaved: { label: "Unsaved", tone: "bg-sun text-on-pastel" },
  working: { label: "In progress", tone: "bg-sky text-on-pastel" },
  /** Something is being made in the background right now (suggestions, a voice-over). */
  busy: { label: "Working…", tone: "bg-sky text-on-pastel" },
  attention: { label: "Check", tone: "bg-bad-soft text-bad" },
};

/** A small spinning ring, for work happening in the background. Still for people who prefer less motion. */
export function Spinner({ className = "size-3" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0 animate-spin motion-reduce:animate-none`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function StateChip({ state }: { state: SectionState }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATE[state].tone}`}
    >
      {state === "busy" ? <Spinner /> : null}
      {STATE[state].label}
    </span>
  );
}

/**
 * One numbered part of a lesson (Script, Voice-over, Vocabulary, Questions): a header that says where it stands
 * and folds the section away. Folded content stays mounted (only hidden), so unsaved text, an open editor and
 * audio players keep their state.
 */
export function EditorSection({
  id,
  step,
  title,
  summary,
  state,
  tint,
  children,
}: {
  id: string;
  /** The badge: the section's number, or an icon for a section outside the numbered steps. */
  step: ReactNode;
  title: string;
  /** One line on where this part stands ("320 words · B1"). */
  summary: string;
  state: SectionState;
  /** The step badge's colour. */
  tint: string;
  children: ReactNode;
}) {
  const { isOpen, toggle } = useCollapsed();
  const open = isOpen(id);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 rounded-3xl border border-line bg-surface">
      <h2 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => toggle(id)}
          className="flex w-full items-center gap-4 rounded-3xl p-4 text-left hover:bg-paper/60 focus-visible:outline-2 focus-visible:outline-accent sm:p-5"
        >
          <span
            aria-hidden="true"
            className={`grid size-10 shrink-0 place-items-center rounded-2xl text-lg font-semibold text-on-pastel ${tint}`}
          >
            {step}
          </span>
          <span className="min-w-0 flex-1">
            <span id={`${id}-title`} className="block text-xl font-semibold tracking-tight">
              {title}
            </span>
            <span className="block truncate text-sm font-normal text-muted">{summary}</span>
          </span>
          <StateChip state={state} />
          <span
            aria-hidden="true"
            className={`grid size-8 shrink-0 place-items-center rounded-full border border-line transition-transform ${open ? "rotate-180" : ""}`}
          >
            <ChevronDownIcon />
          </span>
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!open} className="border-t border-line p-4 sm:p-5">
        {children}
      </div>
    </section>
  );
}
