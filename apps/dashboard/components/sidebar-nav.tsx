"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as I from "./icons";

const ICONS = {
  home: I.HomeIcon,
  book: I.BookIcon,
  headphones: I.HeadphonesIcon,
  layers: I.LayersIcon,
  question: I.QuestionIcon,
  article: I.ArticleIcon,
  image: I.ImageIcon,
  sparkles: I.SparklesIcon,
  tag: I.TagIcon,
  collection: I.CollectionIcon,
  users: I.UsersIcon,
  settings: I.SettingsIcon,
};

export type NavItem = {
  label: string;
  icon: keyof typeof ICONS;
  /** Where it goes; sections without one aren't built yet and show "Soon". */
  href?: string;
  /** Paths that also count as this section. */
  also?: string[];
  /** Only the exact path counts (the Dashboard home). */
  exact?: boolean;
};

const isCurrent = (path: string, item: NavItem) =>
  !!item.href &&
  (path === item.href ||
    (!item.exact && path.startsWith(`${item.href}/`)) ||
    (item.also ?? []).some((p) => path === p || path.startsWith(`${p}/`)));

const row = "flex items-center gap-3 rounded-full px-3 py-1.5 text-sm whitespace-nowrap";

/** One group of sidebar links. The current section gets a pink icon; unbuilt sections are greyed with "Soon". */
export function SidebarNav({ title, items }: { title?: string; items: NavItem[] }) {
  const path = usePathname();
  return (
    <div className="flex shrink-0 gap-1 lg:flex-col">
      {title ? <p className="hidden px-3 pb-1 pt-2 text-xs text-white/45 lg:block">{title}</p> : null}
      <ul className="flex gap-1 lg:flex-col">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const icon = (
            <span className="grid size-7 shrink-0 place-items-center rounded-full group-aria-[current=page]:bg-pink group-aria-[current=page]:text-on-pastel">
              <Icon />
            </span>
          );
          if (!item.href) {
            return (
              <li key={item.label} className="hidden lg:block">
                <span aria-disabled="true" className={`${row} cursor-default text-white/35`}>
                  {icon}
                  {item.label}
                  <span className="ml-auto rounded-full border border-white/15 px-1.5 text-[10px] uppercase tracking-wider text-white/45">
                    Soon
                  </span>
                </span>
              </li>
            );
          }
          return (
            <li key={item.label}>
              <Link
                href={item.href}
                aria-current={isCurrent(path, item) ? "page" : undefined}
                className={`group ${row} text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-pink aria-[current=page]:bg-white/10 aria-[current=page]:font-medium aria-[current=page]:text-white`}
              >
                {icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
