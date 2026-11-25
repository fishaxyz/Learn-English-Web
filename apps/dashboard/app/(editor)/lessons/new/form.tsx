"use client";

import { useActionState, useState } from "react";
import {
  confirmVoiceovers,
  formatNumber,
  MAX_VOICE_CHARACTERS,
  VoicePicker,
  type Catalog,
} from "../../../../components/voice-picker";
import { scriptCharacters } from "../../../../lib/script";
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
  const [script, setScript] = useState("");
  const [voices, setVoices] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const characters = scriptCharacters(script);
  const tooLong = voices.length > 0 && characters > MAX_VOICE_CHARACTERS;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Voice-overs cost ElevenLabs characters: ask first, with the cost.
        if (voices.length && characters && !confirmVoiceovers(catalog, voices.length, characters)) e.preventDefault();
      }}
      className="flex max-w-2xl flex-col gap-5"
    >
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
        <input type="hidden" name="kind" value="READING" />
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
        <label htmlFor="script" className="font-medium">
          Script <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="script"
          name="script"
          rows={14}
          maxLength={50_000}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          aria-describedby="script-help"
          className={`${field} font-reading leading-relaxed`}
        />
        <p id="script-help" className="text-sm text-muted">
          Paste the essay. A blank line starts a new paragraph. You can format it and link words in the editor
          afterwards. {characters ? `${formatNumber(characters)} characters.` : ""}
        </p>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-xl border border-dashed border-line p-4">
        <legend className="px-1 font-medium">
          Voice-over <span className="font-normal text-muted">(optional)</span>
        </legend>
        {script.trim() ? (
          <>
            <VoicePicker
              siteId={siteId}
              characters={characters}
              chosen={voices}
              onChange={setVoices}
              onCatalog={setCatalog}
            />
            {voices.map((v) => (
              <input key={v} type="hidden" name="voice" value={v} />
            ))}
            <p className="text-sm text-muted">
              They&apos;re made after the lesson is created. Listen to each one and approve it before publishing.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Paste a script to choose voices. You can also add them later.</p>
        )}
      </fieldset>
      {state ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || tooLong}
        className="self-start rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Creating…" : voices.length && script.trim() ? "Create draft and make voice-overs" : "Create draft"}
      </button>
    </form>
  );
}
