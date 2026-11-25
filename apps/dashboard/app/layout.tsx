import type { Metadata } from "next";
import { Literata, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const literata = Literata({ subsets: ["latin"], variable: "--font-literata", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · English Skills dashboard" },
  // Private tool: never in search results.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${literata.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
