"use client";

import type { JSONContent } from "@tiptap/react";
import { useActionState, useState } from "react";
import { RichTextEditor } from "../../../../components/rich-text-editor";
import { confirmCost, type Catalog } from "../../../../components/voice-picker";
import { costOf, initialChoice, problemOf, resolved, VoiceSettings } from "../../../../components/voice-settings";
import { voiceText } from "../../../../lib/voice-text";
import { searchSenses } from "../[id]/actions";
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

const field = "rounded-xl border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent";

/**
 * A new reading: the text on the left (the same editor as the lesson page), voice-over settings on the right.
 * Creating saves the draft, then starts the chosen voice-overs; the lesson page opens to check them.
 */
export function NewLessonForm({ siteId, siteDomain }: { siteId: string; siteDomain: string }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createLesson, null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [body, setBody] = useState<JSONContent | null>(null);
  const [choice, setChoice] = useState(initialChoice);
  const [make, setMake] = useState(true);
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  const text = voiceText(body);
  const sent = resolved(choice, catalog);
  const cost = costOf(sent, text);
  // Nothing to voice is fine (a single voice with none chosen just makes no voice-over).
  const wantsVoice = make && (sent.mode === "conversation" || sent.voices.length > 0);
  const problem = wantsVoice ? problemOf(sent, text) : null;
  const button = !wantsVoice
    ? "Create draft"
    : sent.mode === "conversation"
      ? "Create draft and make the podcast"
      : "Create draft and make voice-overs";

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          wantsVoice &&
          !confirmCost(catalog, cost.count > 1 ? `${cost.count} voice-overs` : cost.what, cost.characters)
        ) {
          e.preventDefault();
        }
      }}
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]"
    >
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="kind" value="READING" />
      <input type="hidden" name="body" value={body ? JSON.stringify(body) : ""} />
      <input type="hidden" name="voice" value={JSON.stringify({ ...sent, make })} />

      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
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
        <div className="flex flex-col gap-1.5">
          <p className="font-medium" id="text-label">
            Text
          </p>
          <p className="text-sm text-muted">
            Paste or write the essay. For a podcast, start each line with HOST1: or HOST2:.
          </p>
          <RichTextEditor
            initial={null}
            editable
            onChange={setBody}
            searchSenses={(q) => searchSenses(siteDomain, q)}
            onSenseChosen={() => {}}
            newWordHref={(headword) => `/words/new?${new URLSearchParams({ site: siteId, headword })}`}
          />
          <p className="text-sm text-muted">{text.single ? `${text.single.toLocaleString("en")} characters.` : ""}</p>
        </div>
      </div>

      <aside
        aria-labelledby="voice-heading"
        className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="voice-heading" className="text-xl font-semibold">
            Voice-over
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={make} onChange={(e) => setMake(e.target.checked)} />
            Make it now
          </label>
        </div>
        <div className={make ? "" : "opacity-60"}>
          <VoiceSettings siteId={siteId} text={text} value={choice} onChange={setChoice} onCatalog={setCatalog} />
        </div>
        <p className="text-sm text-muted">
          {make
            ? "Made after the lesson is created. Listen to each one and approve it before publishing."
            : "No voice-over now; you can make one on the lesson page."}
        </p>
        {problem ? <p className="text-sm text-bad">{problem}</p> : null}
        {state ? (
          <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !!problem}
          className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Creating…" : button}
        </button>
      </aside>
    </form>
  );
}
