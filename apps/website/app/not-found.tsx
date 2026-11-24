import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Not found</p>
      <h1 className="font-display text-4xl font-semibold">We couldn&apos;t find that page.</h1>
      <p className="text-lg text-muted">It may have moved, or the lesson may no longer be available.</p>
      <Link
        href="/reading"
        className="rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong"
      >
        Browse reading lessons
      </Link>
    </div>
  );
}
