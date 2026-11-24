# ADR 0004: The learner's vocabulary flow (prepared vocabulary first)

- Status: accepted
- Date: 2026-11-25

## The flow agreed with the product owner

1. A visitor picks a reading.
2. **Read & choose:** they skim the clean text and tap what they want to learn. There is no timer: skimming exists so learners choose for themselves.
3. Tapping opens a card with meaning, translation, 🔊, the sentence from the text and examples, and **Add to my list**.
4. **A tapped word that belongs to a structure** (phrase, collocation, idiom, phrasal verb, sentence pattern) **adds the whole structure**, in its base form ("run late", "like + verb-ing"), with the real sentence as context.
5. A counter shows the list for this reading. Above 8 it gently says smaller lists are easier to remember. **It never blocks.**
6. **Study my words:** only the chosen items are highlighted; each opens its card again.
7. **My words:** one list across all readings, each item with its source sentence.

## Decisions

- **Prepared vocabulary first (option A).** Learners choose from words and structures editors prepared. Tapping anything else says kindly that it isn't in the word list yet.
  - Learners adding any word, with dictionary or AI meanings marked "not checked yet", comes later (option B).
- **Structures are word-bank entries** of a non-WORD kind. The new kind is `SENTENCE_PATTERN`, written with "+" for the part that changes.
  - Editors link a structure over its full span.
  - A split pattern is linked in each place to the same sense and becomes one item.
  - Overlapping links ("rush" inside "rush hour") aren't supported; the largest structure is what editors link.
- **Key words:** a flag on a link in the text (`key` mark attribute, `lexical_annotations.is_key`). Key words are shown first as "Suggested".
- **Translations:** in any language, written by editors per sense revision (`lexical_glosses`).
  - Each learner picks their language once.
  - The sample Vietnamese translations were written for this project and should be reviewed by an editor.
- **Audio:** the browser's own speech synthesis (free, on the device; quality varies). Patterns are spoken as they appear in the text. Recorded audio replaces it once uploads exist (Phase 3).
- **The list lives in the learner's browser** (`localStorage`). It holds snapshots of the items, so My words works without asking the server again.
  - It's never account data.
  - It moves into the account when learner accounts arrive (Phase 5).
  - If storage is blocked, the list still works for that visit.
- **Accessibility.** Prepared items are buttons named by the words as written in the text, with "(in your list)" added when chosen. Cards are dialogs that close with Escape and return focus. A card opens above the word when there's no room below.

## Later

- Learners adding any word (option B), and counting which unprepared words are tapped most, to tell editors what to prepare next.
- A practice exercise built from the learner's chosen words.
- Recorded audio (Phase 3), and moving the list into learner accounts (Phase 5).
