import type { Metadata } from "next";
import { MyWordsList } from "./my-words-list";

export const metadata: Metadata = {
  title: "My words",
  // Personal to each visitor's browser: nothing here for search engines.
  robots: { index: false, follow: true },
};

export default function MyWords() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-semibold">My words</h1>
        <p className="max-w-2xl text-lg text-muted">
          The words and phrases you chose while reading. They&apos;re kept in this browser; when accounts arrive,
          you&apos;ll be able to keep them everywhere.
        </p>
      </header>
      <MyWordsList />
    </div>
  );
}
