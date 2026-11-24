"use client";

import { useActionState, useState } from "react";
import { createLesson, type CreateState } from "./actions";

/** "My First Lesson!" → "my-first-lesson". Editors can still change it before creating. */
export const slugify = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const field = "rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent";

export function NewLessonForm({ siteId }: { siteId: string }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createLesson, null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="siteId" value={siteId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="font-medium">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          value={title}
          className={field}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="font-medium">
          Web address
        </label>
        <div className="flex items-center gap-1 text-sm text-muted">
          <span>/reading/</span>
          <input
            id="slug"
            name="slug"
            required
            maxLength={120}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            aria-describedby="slug-help"
            className={`${field} flex-1 font-mono text-ink`}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
          />
        </div>
        <p id="slug-help" className="text-sm text-muted">
          Lowercase words joined by hyphens. It can&apos;t be changed after publishing.
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kind" className="font-medium">
            Type
          </label>
          <select id="kind" name="kind" className={field} defaultValue="READING">
            <option value="READING">Reading</option>
            <option value="ARTICLE">Article</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="level" className="font-medium">
            Level
          </label>
          <select id="level" name="level" className={field} defaultValue="">
            <option value="">Not set</option>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
