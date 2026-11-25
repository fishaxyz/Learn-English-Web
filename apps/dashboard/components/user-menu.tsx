"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccountIcon, ChevronDownIcon, WebsiteIcon } from "./icons";

/** The account menu at the top right: who is signed in, their account, the website, sites, and log out. */
export function UserMenu({
  email,
  role,
  websiteUrl,
  sites,
  logOut,
}: {
  email: string;
  role: string;
  websiteUrl: string;
  sites: { id: string; name: string }[];
  /** The log-out form (a server action), rendered inside the menu. */
  logOut: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-paper";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="grid size-9 place-items-center rounded-full bg-pink font-semibold uppercase text-on-pastel">
          {email.slice(0, 1)}
        </span>
        <span className="hidden max-w-48 truncate text-sm font-medium sm:block">{email}</span>
        <ChevronDownIcon />
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 flex w-64 flex-col gap-1 rounded-2xl border border-line bg-surface p-2 shadow-xl">
          <p className="truncate px-3 pb-1 pt-2 text-xs text-muted">
            {email} · {role.toLowerCase()}
          </p>
          <Link href="/account" className={item} onClick={() => setOpen(false)}>
            <AccountIcon /> Account
          </Link>
          <a href={websiteUrl} target="_blank" rel="noreferrer" className={item}>
            <WebsiteIcon /> View website<span className="sr-only"> (opens in a new tab)</span>
          </a>
          {sites.length > 1 ? (
            <div className="border-t border-line pt-1">
              <p className="px-3 py-1 text-xs text-muted">Sites</p>
              {sites.map((s) => (
                <Link key={s.id} href={`/?site=${s.id}`} className={item} onClick={() => setOpen(false)}>
                  {s.name}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="border-t border-line pt-1">{logOut}</div>
        </div>
      ) : null}
    </div>
  );
}
