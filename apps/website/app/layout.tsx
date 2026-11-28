import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { siteUrl } from "../lib/env";
import { LEVELS } from "../lib/levels";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const literata = Literata({ subsets: ["latin"], variable: "--font-literata", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: "English Skills: read, listen and learn words", template: "%s · English Skills" },
    description:
      "Short English lessons by level: read a text, learn its words in context, and check your understanding.",
    openGraph: { siteName: "English Skills", type: "website" },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${literata.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-b border-line bg-surface/80 backdrop-blur">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4"
          >
            <Link href="/" className="font-display text-xl font-semibold text-ink">
              English Skills
            </Link>
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium">
              <li>
                <Link href="/reading" className="hover:text-accent">
                  Reading
                </Link>
              </li>
              <li className="flex items-center gap-1" aria-label="Levels">
                {LEVELS.map((level) => (
                  <Link
                    key={level}
                    href={`/levels/${level.toLowerCase()}`}
                    className="rounded-md px-1.5 py-0.5 text-muted hover:bg-accent-soft hover:text-accent"
                  >
                    {level}
                  </Link>
                ))}
              </li>
            </ul>
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
          {children}
        </main>
        <footer className="border-t border-line">
          <p className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted">
            Levels follow the CEFR scale and are our editors&apos; estimate of each lesson&apos;s difficulty.
          </p>
        </footer>
      </body>
    </html>
  );
}
