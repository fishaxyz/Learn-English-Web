# ADR 0006: A reading lesson has four parts, and goes out only when all are finished

- Status: accepted
- Date: 2026-11-25

## What editors see

- The lesson page is split into four numbered sections, each of which can be collapsed:
  1. **Script**
  2. **Voice-over**
  3. **Lexical vocabulary**
  4. **Questions & quizzes**
- Each section header shows a one-line summary (for example "320 words · B1" or "2 voice-overs · 1 approved") and a state: To do, Unsaved, In progress, Check or Done.
  - Collapsed sections stay loaded, so unsaved work isn't lost.
  - The browser remembers which sections are collapsed.
- **Saving always works.** **Submit for review**, **Publish** and **Publish now** wait until every part is finished.
  - The publish card lists what's left, with links to those sections.
- In the **Reading Library**, each lesson shows four part tags: a filled icon when a part is done, and an outlined "No voice-over"-style tag when it isn't.
  - The **Progress** filter shows lessons that need a script, a voice-over, vocabulary or questions, or those ready to publish.
  - The **Dashboard** home has a **Left to finish** card with a count per part.

## When a part counts as finished

| Part | Finished when |
| --- | --- |
| Script | The text isn't empty. |
| Voice-over | There's an approved voice-over that still matches the text, so a changed text needs a new one. |
| Lexical vocabulary | At least one word or structure is linked. |
| Questions | At least one question has been saved. |

## Decisions

- **The API enforces it** (`modules/resources/checklist.ts`), in `submitForReview`, `publishResource` and `publishNow`. The dashboard's disabled buttons are only a convenience.
  - The check applies to reading lessons only.
  - `Revision.checklist` reports each part and what's `missing`, batched through the existing loaders.
- The rule is part of the server's configuration (`requiredParts`, all four in production). The seed script publishes sample lessons without audio, because audio files are never invented. Most API tests run without the rule, and one test turns it on and checks it.
- **Tests never spend credits.** The end-to-end stack runs with `TTS_PROVIDER=fake` (`pnpm e2e:stack`), so the API offers the test voices and the worker makes silent audio. The browser tests make, approve and publish real (silent) voice-overs, including a two-host podcast.
