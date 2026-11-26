"use client";

import type { DraftTranslationsFieldsFragment } from "@english/graphql";
import { useCallback, useEffect, useState, useTransition } from "react";
import * as actions from "../app/(editor)/lessons/[id]/actions";
import type { SectionState } from "./editor-section";
import { Working } from "./working";

export const TRANSLATION_LANGUAGES = [
  { locale: "vi", name: "Vietnamese" },
  { locale: "fr", name: "French" },
  { locale: "de", name: "German" },
] as const;

export const emptyTranslations = (locale: string): DraftTranslationsFieldsFragment => ({
  locale,
  state: "IDLE",
  usedLanguageModel: null,
  sentences: [],
});

/** The Translation section's header: where this language stands. Translations are optional for publishing. */
export function translationSummary(data: DraftTranslationsFieldsFragment): { summary: string; state: SectionState } {
  const name = TRANSLATION_LANGUAGES.find((l) => l.locale === data.locale)?.name ?? data.locale;
  const total = data.sentences.length;
  const approved = data.sentences.filter((s) => s.translation?.status === "APPROVED").length;
  const drafts = data.sentences.filter((s) => s.translation?.status === "DRAFT").length;
  if (data.state === "WORKING") return { summary: `Translating into ${name}…`, state: "busy" };
  if (!total || (!approved && !drafts)) return { summary: "Optional · Vietnamese, French, German", state: "todo" };
  return {
    summary: `${name}: ${approved} of ${total} approved${drafts ? ` · ${drafts} to check` : ""}`,
    state: approved === total ? "done" : "working",
  };
}

/**
 * Sentence translations for bilingual reading. The local AI drafts them (one paragraph at a time, one translation
 * per sentence); editors check, edit and approve. Learners only see approved ones. Translations follow the saved
 * script: changed sentences are translated again automatically, as drafts. Text only: no voice-over.
 */
export function TranslationsPanel({
  resourceId,
  localizationId,
  lockVersion,
  editable,
  saved,
  hasScript,
  ensureSaved,
  paragraphs,
  data,
  onData: setData,
}: {
  resourceId: string;
  localizationId: string;
  lockVersion: number;
  editable: boolean;
  /** Translations follow the saved script: everything must be saved first. */
  saved: boolean;
  hasScript: boolean;
  ensureSaved: () => Promise<boolean>;
  paragraphs: number;
  /** The language shown, kept by the page (its Translation header sums it up). */
  data: DraftTranslationsFieldsFragment;
  onData: (data: DraftTranslationsFieldsFragment) => void;
}) {
  const locale = data.locale;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(
    async (which = locale) => {
      const r = await actions.draftTranslations(resourceId, which);
      if (r.ok) setData(r.translations);
      else setMessage({ tone: "bad", text: r.message });
    },
    [resourceId, locale, setData]
  );

  // A new language, or a saved script (translations follow it): load what's there now.
  useEffect(() => {
    let live = true;
    void actions.draftTranslations(resourceId, locale).then((r) => {
      if (live && r.ok) setData(r.translations);
    });
    return () => {
      live = false;
    };
  }, [lockVersion, resourceId, locale, setData]);

  // While the AI is translating, check every few seconds.
  useEffect(() => {
    if (data.state !== "WORKING") return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [data.state, refresh]);

  const name = TRANSLATION_LANGUAGES.find((l) => l.locale === locale)?.name ?? locale;
  const missing = data.sentences.filter((s) => !s.translation).length;
  const drafts = data.sentences.filter((s) => s.translation?.status === "DRAFT");
  const approved = data.sentences.filter((s) => s.translation?.status === "APPROVED").length;
  const canAct = editable && saved && !pending && data.state !== "WORKING";
  const textOf = (t: { id: string; text: string }) => edits[t.id] ?? t.text;

  function choose(next: string) {
    setEdits({});
    setMessage(null);
    setData(emptyTranslations(next));
  }

  function translate(redo: boolean) {
    start(async () => {
      if (!(await ensureSaved())) return;
      const r = await actions.translateDraft(localizationId, locale, redo);
      setMessage(r.ok ? null : { tone: "bad", text: r.message ?? "Something went wrong." });
      await refresh();
    });
  }

  function approve(items: { id: string; text: string }[]) {
    if (items.some((i) => !i.text.trim())) {
      setMessage({ tone: "bad", text: "A translation can't be empty." });
      return;
    }
    start(async () => {
      const r = await actions.approveTranslations(localizationId, items);
      if (!r.ok) return setMessage({ tone: "bad", text: r.message });
      const done = new Set(items.map((i) => i.id));
      setEdits((now) => Object.fromEntries(Object.entries(now).filter(([id]) => !done.has(id))));
      setMessage({ tone: "good", text: `Approved ${r.count} translation${r.count === 1 ? "" : "s"}.` });
      await refresh();
    });
  }

  const button = "rounded-full px-3 py-1 text-sm font-semibold disabled:opacity-50";
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Translation language" className="flex flex-wrap gap-1">
        {TRANSLATION_LANGUAGES.map((l) => (
          <button
            key={l.locale}
            type="button"
            aria-pressed={locale === l.locale}
            onClick={() => choose(l.locale)}
            className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold hover:border-accent aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
          >
            {l.name}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted">
        The local AI drafts a translation for each sentence; you check, edit and approve them. Learners see approved
        translations only, as text (no voice-over). When you save changes to the script, changed sentences are
        translated again automatically, as drafts to check.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {editable && data.state !== "WORKING" ? (
          <>
            {missing || !data.sentences.length ? (
              <button
                type="button"
                onClick={() => translate(false)}
                disabled={pending || !hasScript}
                title={hasScript ? undefined : "Write the script first"}
                className={`${button} bg-accent text-on-accent hover:bg-accent-strong`}
              >
                {pending ? "Starting…" : approved || drafts.length ? `Translate the rest (${missing})` : "Translate"}
              </button>
            ) : null}
            {drafts.length ? (
              <button
                type="button"
                onClick={() => translate(true)}
                disabled={pending}
                className={`${button} border border-line bg-surface hover:border-accent`}
              >
                Translate drafts again
              </button>
            ) : null}
            {drafts.length ? (
              <button
                type="button"
                onClick={() =>
                  approve(
                    drafts.flatMap((s) =>
                      s.translation ? [{ id: s.translation.id, text: textOf(s.translation) }] : []
                    )
                  )
                }
                disabled={!canAct}
                className={`${button} bg-accent text-on-accent hover:bg-accent-strong`}
              >
                ✓ Approve all drafts ({drafts.length})
              </button>
            ) : null}
          </>
        ) : null}
        {data.sentences.length ? (
          <span className="ml-auto text-sm text-muted" aria-live="polite">
            {approved} approved · {drafts.length} to check · {missing} not translated
          </span>
        ) : null}
      </div>

      {data.state === "WORKING" ? (
        <Working
          label={`Translating into ${name}…`}
          note={`The local AI translates one paragraph at a time: about ${Math.max(1, paragraphs)} minute${
            paragraphs > 1 ? "s" : ""
          } for ${paragraphs || 1} paragraph${paragraphs === 1 ? "" : "s"}. You can keep working; translations appear here.`}
          rows={2}
        />
      ) : null}
      {data.state === "FAILED" ? (
        <p className="text-sm text-bad">The translation couldn&apos;t be made. Try “Translate” again.</p>
      ) : null}
      {data.state === "DONE" && data.usedLanguageModel === false ? (
        <p className="text-sm text-bad">
          The local AI wasn&apos;t running, so nothing was translated. Start it, then press “Translate” again.
        </p>
      ) : null}
      {!saved ? <p className="text-sm text-bad">Save the script first: translations follow the saved script.</p> : null}
      {message ? (
        <p role="status" className={`text-sm ${message.tone === "bad" ? "text-bad" : "text-good"}`}>
          {message.text}
        </p>
      ) : null}

      {data.sentences.length && (approved || drafts.length) ? (
        <ol className="flex flex-col gap-2">
          {data.sentences.map((s) => {
            const t = s.translation;
            const edited = t ? textOf(t) !== t.text : false;
            return (
              <li
                key={`${s.blockId}:${s.start}`}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3"
              >
                <p className="text-sm text-muted">{s.source}</p>
                {t ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                    <textarea
                      lang={locale}
                      aria-label={`${name} translation of “${s.source}”`}
                      value={textOf(t)}
                      disabled={!editable || pending}
                      onChange={(e) => setEdits((now) => ({ ...now, [t.id]: e.target.value }))}
                      rows={2}
                      className="min-h-16 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm"
                    />
                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          edited
                            ? "bg-sun text-on-pastel"
                            : t.status === "APPROVED"
                              ? "bg-good-soft text-good"
                              : "bg-sky text-on-pastel"
                        }`}
                      >
                        {edited ? "Edited" : t.status === "APPROVED" ? "Approved" : "Draft"}
                      </span>
                      {editable && (t.status === "DRAFT" || edited) ? (
                        <button
                          type="button"
                          aria-label={`Approve the ${name} translation of “${s.source}”`}
                          disabled={!canAct}
                          onClick={() => approve([{ id: t.id, text: textOf(t) }])}
                          className={`${button} bg-accent text-on-accent hover:bg-accent-strong`}
                        >
                          ✓ Approve
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted">Not translated yet.</p>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
