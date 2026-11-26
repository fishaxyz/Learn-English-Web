# 0009 Sentence translations for bilingual reading

Date: 2026-11-27 · Status: accepted

## Context

Learners can read a lesson bilingually: a translation under each sentence, under each paragraph, beside the text,
or on demand when they tap a sentence. Translations are text only (no voice-over). The owner chose Vietnamese,
French and German, the local language model (Qwen3 14B) for all three, and an editor's approval before learners
see anything. When the English script changes, translations must follow it.

## Decision

- One row per sentence and language in `sentence_translations`, on the revision, like lexical annotations:
  block id + code-point offsets, the English `source_text`, the translation, and DRAFT or APPROVED.
- Sentences are split by the same rule on the API (`modules/rich-text.ts`) and on the website
  (`lib/text-spans.ts`), so translations line up with the sentences learners tap and hear.
- An editor presses **Translate**: a `translations.translate` job sends whole paragraphs, sentences numbered, and
  the model answers one translation per number. The API keeps only answers for sentences that still read exactly as
  they did when asked, never overwriting an existing translation.
- **Saving the script syncs translations**: a sentence that's still there keeps its translation (offsets updated);
  a changed or new sentence loses it, and every language the lesson has is translated again automatically, as
  drafts to check.
- Only editors (content.write) translate and approve; learners can't change anything. The website gets approved
  translations of the published revision only. A new draft starts with the published revision's translations.
- Translations are optional for publishing; untranslated sentences simply show none.
- Browser tests use `TRANSLATION_PROVIDER=fake` (each sentence marked "[VI] …"), never the language model.

## Consequences

- No new dependency or download; quality is Qwen3 14B's (French and German good, Vietnamese needs the most
  checking). A stronger model (e.g. Gemma 3 12B) can replace it without changing anything else.
- Without the local AI running, translating does nothing and the editor says so.
- `?preview-translations` on the website still shows example translations, for layout review; remove it later.
