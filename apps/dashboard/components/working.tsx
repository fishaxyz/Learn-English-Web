"use client";

import { useEffect, useState } from "react";
import { Spinner } from "./editor-section";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Background work in progress (the local AI making suggestions): a spinner, a moving bar, how long it has been,
 * what to expect, and placeholders where the results will appear.
 */
export function Working({ label, note, rows = 3 }: { label: string; note: string; rows?: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Spinner className="size-4" />
        {label}
        <span className="ml-auto tabular-nums text-muted">{clock(seconds)} so far</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-line/70" aria-hidden="true">
        <div className="vocab-progress absolute inset-y-0 w-1/3 rounded-full bg-accent" />
      </div>
      <p className="text-sm text-muted">{note}</p>
      <ul className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <li
            key={i}
            className="flex animate-pulse gap-3 rounded-2xl border border-line bg-surface p-3 motion-reduce:animate-none"
          >
            <span className="mt-1 size-4 rounded bg-line" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-3 w-1/3 rounded bg-line" />
              <span className="h-3 w-5/6 rounded bg-line/70" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
