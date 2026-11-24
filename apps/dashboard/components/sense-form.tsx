"use client";

import type { CefrLevel, EditorialSenseFieldsFragment, LexicalEntryKind } from "@english/graphql";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publishSense, saveSense } from "../app/(editor)/words/actions";
import { KINDS, LANGUAGES, senseKeyFor } from "../lib/words";

const field =
  "rounded-lg border border-line bg-surface px-3 py-2 focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper";
const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

type Props = {
  siteId: string;
  sense?: EditorialSenseFieldsFragment;
  initialHeadword?: string;
  canWrite: boolean;
  canPublish: boolean;
};

/** One word or structure, as editors prepare it once and reuse in every text (AGENTS.md §5.3). */
export function SenseForm({ siteId, sense, initialHeadword = "", canWrite, canPublish }: Props) {
  const router = useRouter();
  const revision = sense?.draft ?? sense?.published;
  const [headword, setHeadword] = useState(sense?.entry.displayForm ?? initialHeadword);
  const [kind, setKind] = useState<LexicalEntryKind>(sense?.entry.kind ?? "WORD");
  const [partOfSpeech, setPartOfSpeech] = useState(sense?.partOfSpeech ?? "noun");
  const [senseKey, setSenseKey] = useState(sense?.senseKey ?? "");
  const [keyEdited, setKeyEdited] = useState(Boolean(sense));
  const [level, setLevel] = useState<CefrLevel | "">(revision?.cefrLevel ?? "");
  const [definition, setDefinition] = useState(revision?.definition ?? "");
  const [usageNote, setUsageNote] = useState(revision?.usageNote ?? "");
  const [register, setRegister] = useState(revision?.register ?? "");
  const [examples, setExamples] = useState<string[]>(revision?.examples.map((e) => e.sentence) ?? [""]);
  const [uk, setUk] = useState(revision?.pronunciations.find((p) => p.accent === "en-GB")?.ipa ?? "");
  const [us, setUs] = useState(revision?.pronunciations.find((p) => p.accent === "en-US")?.ipa ?? "");
  const [translations, setTranslations] = useState(
    revision?.translations.map((t) => ({ ...t })) ?? [{ locale: "vi", text: "" }]
  );
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const isNew = !sense;
  const pattern = kind === "SENTENCE_PATTERN";
  const key = keyEdited ? senseKey : senseKeyFor(headword, partOfSpeech);

  function save() {
    start(async () => {
      const result = await saveSense({
        siteId,
        ...(sense ? { senseId: sense.id, lockVersion: sense.draft?.lockVersion ?? null } : { headword, kind }),
        partOfSpeech,
        senseKey: key,
        definition,
        cefrLevel: level || null,
        usageNote: usageNote.trim() || null,
        register: register.trim() || null,
        examples: examples
          .map((sentence) => sentence.trim())
          .filter(Boolean)
          .map((sentence) => ({ sentence })),
        pronunciations: [
          ...(uk.trim() ? [{ accent: "en-GB", ipa: uk.trim() }] : []),
          ...(us.trim() ? [{ accent: "en-US", ipa: us.trim() }] : []),
        ],
        translations: translations
          .filter((t) => t.text.trim())
          .map((t) => ({ locale: t.locale.trim(), text: t.text.trim() })),
      });
      if (!result.ok) return setMessage({ tone: "bad", text: result.message });
      setMessage({ tone: "good", text: "Saved as a draft." });
      if (isNew) router.push(`/words/${result.sense.id}`);
      else router.refresh();
    });
  }

  function publish() {
    const draft = sense?.draft;
    if (!sense || !draft) return;
    start(async () => {
      const result = await publishSense(sense.id, draft.lockVersion);
      if (!result.ok) return setMessage({ tone: "bad", text: result.message });
      setMessage({ tone: "good", text: "Published. It can now be linked in texts." });
      router.refresh();
    });
  }

  const disabled = !canWrite || pending;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid max-w-3xl gap-5"
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label htmlFor="headword" className="flex flex-col gap-1.5 font-medium">
          {pattern ? "Pattern" : "Word or phrase"}
          <input
            id="headword"
            className={field}
            required
            maxLength={120}
            value={headword}
            disabled={!isNew || disabled}
            placeholder={pattern ? "like + verb-ing" : "commute"}
            onChange={(e) => setHeadword(e.target.value)}
          />
          {pattern ? (
            <span className="text-sm font-normal text-muted">
              Use + for the part that changes, e.g. “If I were you, I’d + verb”.
            </span>
          ) : null}
        </label>
        <label htmlFor="kind" className="flex flex-col gap-1.5 font-medium">
          Type
          <select
            id="kind"
            className={field}
            value={kind}
            disabled={!isNew || disabled}
            onChange={(e) => setKind(e.target.value as LexicalEntryKind)}
          >
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor="pos" className="flex flex-col gap-1.5 font-medium">
          Part of speech
          <input
            id="pos"
            list="pos-list"
            className={field}
            required
            value={partOfSpeech}
            disabled={disabled}
            onChange={(e) => setPartOfSpeech(e.target.value.toLowerCase())}
          />
          <datalist id="pos-list">
            {["noun", "verb", "adjective", "adverb", "preposition", "phrase", "verb phrase", "pattern"].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label htmlFor="level" className="flex flex-col gap-1.5 font-medium">
          Level
          <select
            id="level"
            className={field}
            value={level}
            disabled={disabled}
            onChange={(e) => setLevel(e.target.value as CefrLevel | "")}
          >
            <option value="">Not set</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="sense-key" className="flex flex-col gap-1.5 font-medium">
          Key
          <input
            id="sense-key"
            className={`${field} font-mono text-sm`}
            value={key}
            disabled={disabled}
            onChange={(e) => {
              setSenseKey(e.target.value);
              setKeyEdited(true);
            }}
          />
        </label>
      </div>
      <label htmlFor="definition" className="flex flex-col gap-1.5 font-medium">
        {pattern ? "What it means and when to use it" : "Meaning"}
        <span className="text-sm font-normal text-muted">In simple English, at or below the word&apos;s level.</span>
        <textarea
          id="definition"
          className={field}
          rows={2}
          required
          maxLength={1000}
          value={definition}
          disabled={disabled}
          onChange={(e) => setDefinition(e.target.value)}
        />
      </label>
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Translations</legend>
        {translations.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`Translation ${i + 1} language`}
              className={field}
              value={t.locale}
              onChange={(e) =>
                setTranslations(translations.map((x, j) => (j === i ? { ...x, locale: e.target.value } : x)))
              }
            >
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
              {!LANGUAGES.some(([c]) => c === t.locale) ? <option value={t.locale}>{t.locale}</option> : null}
            </select>
            <input
              aria-label={`Translation ${i + 1}`}
              className={`${field} min-w-0 flex-1`}
              maxLength={500}
              value={t.text}
              onChange={(e) =>
                setTranslations(translations.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
              }
            />
            <button
              type="button"
              className="text-sm text-muted hover:text-bad"
              onClick={() => setTranslations(translations.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-sm font-medium text-accent hover:underline"
          onClick={() =>
            setTranslations([
              ...translations,
              { locale: LANGUAGES.find(([c]) => !translations.some((t) => t.locale === c))?.[0] ?? "vi", text: "" },
            ])
          }
        >
          Add a translation
        </button>
      </fieldset>
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Example sentences</legend>
        {examples.map((sentence, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              aria-label={`Example ${i + 1}`}
              className={`${field} flex-1`}
              maxLength={500}
              value={sentence}
              onChange={(e) => setExamples(examples.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              className="text-sm text-muted hover:text-bad"
              onClick={() => setExamples(examples.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="self-start text-sm font-medium text-accent hover:underline"
          onClick={() => setExamples([...examples, ""])}
        >
          Add an example
        </button>
      </fieldset>
      {!pattern ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="uk" className="flex flex-col gap-1.5 font-medium">
            UK pronunciation (IPA)
            <input
              id="uk"
              className={field}
              placeholder="/kəˈmjuːt/"
              value={uk}
              disabled={disabled}
              onChange={(e) => setUk(e.target.value)}
            />
          </label>
          <label htmlFor="us" className="flex flex-col gap-1.5 font-medium">
            US pronunciation (IPA)
            <input
              id="us"
              className={field}
              placeholder="/kəˈmjuːt/"
              value={us}
              disabled={disabled}
              onChange={(e) => setUs(e.target.value)}
            />
          </label>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor="usage" className="flex flex-col gap-1.5 font-medium">
          Usage note (optional)
          <input
            id="usage"
            className={field}
            maxLength={1000}
            value={usageNote}
            disabled={disabled}
            onChange={(e) => setUsageNote(e.target.value)}
          />
        </label>
        <label htmlFor="register" className="flex flex-col gap-1.5 font-medium">
          Register (optional)
          <input
            id="register"
            className={field}
            placeholder="informal"
            value={register}
            disabled={disabled}
            onChange={(e) => setRegister(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {canWrite ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-60"
          >
            {pending ? "Saving…" : isNew ? "Create draft" : sense?.draft ? "Save draft" : "Save as new draft"}
          </button>
        ) : null}
        {canPublish && sense?.draft ? (
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className="rounded-full border border-accent px-5 py-2 font-semibold text-accent hover:bg-accent-soft disabled:opacity-60"
          >
            Publish
          </button>
        ) : null}
        <p aria-live="polite" className={`text-sm ${message?.tone === "bad" ? "text-bad" : "text-good"}`}>
          {message?.text}
        </p>
      </div>
    </form>
  );
}
