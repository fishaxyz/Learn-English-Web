"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountIcon, LessonsIcon, WebsiteIcon, WordsIcon } from "./icons";

const ICONS = { lessons: LessonsIcon, words: WordsIcon, account: AccountIcon, website: WebsiteIcon };

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Paths that also count as this section (lesson pages belong to Lessons). */
  also?: string[];
  external?: boolean;
};

const isCurrent = (path: string, item: NavItem) =>
  path === item.href ||
  (item.href !== "/" && path.startsWith(`${item.href}/`)) ||
  (item.also ?? []).some((p) => path === p || path.startsWith(`${p}/`));

/** One group of sidebar links; the current section is marked with a pink icon. */
export function SidebarNav({ title, items }: { title: string; items: NavItem[] }) {
  const path = usePathname();
  return (
    <div className="flex flex-col gap-1">
      <p className="hidden px-3 pb-1 text-xs text-white/50 lg:block">{title}</p>
      <ul className="flex flex-wrap gap-1 lg:flex-col">
        {items.map((item) => {
          const current = !item.external && isCurrent(path, item);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                className="group flex items-center gap-3 rounded-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-pink aria-[current=page]:text-white"
              >
                <span className="grid size-7 place-items-center rounded-full group-aria-[current=page]:bg-pink group-aria-[current=page]:text-on-pastel">
                  <Icon />
                </span>
                {item.label}
                {item.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
