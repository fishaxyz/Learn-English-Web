# ADR 0011: Vocabulary sheets, as the editor wrote them

- Status: accepted (replaces the list and AI explaining of ADR 0010; the rest of ADR 0010 stands)
- Date: 2026-11-28

## Context

Editors already write full vocabulary sheets for each lesson (see `apps/api/test/fixtures/vanishing-dark.txt`). Each
item has a part of speech, a pronunciation, a meaning in the learners' language, an English definition, a usage
pattern, examples from the text and new ones with translations, synonyms with register notes, and notes on common
mistakes and word families. There are also sentence structures, and paraphrase pairs tied to questions. The
one-line list of ADR 0010 couldn't hold any of this, and the local AI's explanations were thinner than the editor's.
The owner decided:
- sheets follow the same layout, not always exactly;
- translations follow the learner's native language;
- no AI;
- a question number ("Q2") is a label for now.

## Decision

- **The sheet is read as written** (`apps/api/src/modules/lexical-items/sheet.ts`). The reader is forgiving:
  - a section heading ("A. Vocabulary", "Idioms") sets the kind;
  - a numbered line starts an item: its words, `(v)`, `/ipa/`, and the meaning after a spaced dash;
  - the first plain line is the English definition;
  - labelled lines (`Usage:`, `Use:`, `Example:`, `Synonyms:`, `Note:`) fill their parts, and plain lines after an
    example are more examples;
  - an arrow line (`→`) translates the line above it;
  - each synonym line is the words, a note on when to use them, and a translation in brackets;
  - `text ↔ question – meaning (Q2)` is a paraphrase pair;
  - a sheet with no numbered lines is read as a plain list, one item per line.
- **Word numbering is kept.** In a .docx, Word's automatic numbering and bullets aren't in the text, so the
  browser writes them back from `word/numbering.xml` ("1. ", "A. ", "- ").
- **One native language per sheet.** The editor chooses the language when adding a sheet (Vietnamese, French or
  German, as for translations).
  - English parts are shared by every learner: definition, usage, examples, synonyms and their notes.
  - Each language adds its own parts: the meaning, a translated definition, translations of examples and synonyms,
    and its notes. Notes belong to a language because sheets write them in the learners' language.
  - A second sheet in another language adds that language to the same items, matched by their words. Items it
    updates go back to draft.
- **No AI.** The `lexicon.explain` job and `LEXICAL_PROVIDER` are removed. Editors check each item as learners will
  see it, can change its kind, and approve it or remove it.
- **"In the text"**: an example sentence is marked when it's in the current script (case, quotes, "…" and the final
  stop ignored).
- **Learners** see cards in their chosen translation language. A card shows:
  - the meaning in their language, then the definition;
  - how to use it;
  - the sentence from the text, then more examples, each with its translation;
  - synonyms with their notes;
  - the notes.
  A paraphrase shows the question's words, and its question number as a label.
- **Earlier items are converted** (migration 0016):
  - the AI's English meaning becomes the definition;
  - the example and synonyms move to the new shape;
  - items still waiting for the AI become drafts.

## Consequences

- A learner whose language has no sheet yet sees the English parts only.
- If a later sheet has different examples, translations are kept only for the examples whose text still matches.
- What the question numbers do (links to the questions) is decided later.
- Fixing a typo means fixing the sheet and adding it again, which updates the item.
