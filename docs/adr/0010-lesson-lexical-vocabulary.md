# ADR 0010: Each lesson's own lexical vocabulary

- Status: accepted
- Date: 2026-11-28

## Context

Learners met vocabulary as marked words in the article: a tap opened a dictionary card, and words could be saved
to "My words". The marked spans often didn't match their card (the AI linked "had little to rely on" to **rely on**),
and with sentence translations on every article, a dictionary inside the text duplicated work. The owner wants
lexical vocabulary to be an IELTS study bank instead: keywords, synonyms and paraphrases, idioms, collocations and
common sentence structures, chosen by the editor for each lesson.

## Decision

- **The editor's list is the source.** In the lesson editor's Lexical vocabulary section, editors type or paste a
  list, or read it from a `.txt` or `.docx` file. One item per line; an optional note after a spaced dash or a tab
  (`a grain of truth — idiom`). The browser reads the file (for a .docx, only `word/document.xml`, size-limited);
  nothing is uploaded.
- **The local AI explains, editors approve.** A `lexicon.explain` job (Qwen3, a few items per request, with the
  lesson's text) drafts each item: its kind (keyword, collocation, idiom, phrasal verb, sentence structure,
  paraphrase), a simple meaning, synonyms, an IELTS-style example, an IELTS tip, and the item's words as the text
  writes them (`passed … on`). Editors edit any field and approve, or remove items. Only approved items reach
  learners. `LEXICAL_PROVIDER=fake` explains recognizably for browser tests.
- **Each lesson keeps its own items** (`lexical_items`, per revision): nothing is shared, even when two lessons list
  the same idiom. A new draft copies the published items; published items are frozen like the rest of the revision.
- **"In this text" is found when shown**, in the current script, from the item's quoted words (or the item itself,
  without a pattern's `+ verb` part), so script edits never leave it stale.
- **Learners study in the Lexical Vocabulary tab**, filtered by kind. The article is clean text: no marked words, no
  cards. "My words" is removed.
- **Approved items count as the lesson's vocabulary** in the checklist (words linked in the text still count, for
  older lessons).

## Consequences

- The AI word suggestions and links in the text stay in the editor for now (not shown to learners); whether to keep
  them is decided later.
- Explaining is slow on the CPU (about a minute for every 5 items); it runs in the background like translations.
- Explanations are English only for now.
