# ADR 0012: A lesson from its three files

- Status: accepted
- Date: 2026-11-28

## Context

Editors prepare each lesson as three files: the script (reading passage), the questions with an answer key, and
the vocabulary sheet (ADR 0011). Typing them into the editor field by field is slow.

## Decision

- **Each part of the lesson editor reads its own file** (.txt or .docx, read in the browser; nothing is uploaded).
  Files fill the editor's usual fields; the editor checks them and saves with the usual button. The API validates as
  for anything typed. The New lesson page and the lesson editor share these parts.
- **Script** (`apps/dashboard/lib/script-file.ts`):
  - the first line is the title, and a short second line is the summary;
  - each line after that is a paragraph;
  - paragraph letters ("A  For most…") and **bold** marks are dropped, because the site letters paragraphs itself
    and the article stays clean;
  - the file replaces the text after a confirmation;
  - the title and summary only fill empty fields.
- **Questions** (`apps/dashboard/lib/question-file.ts`):
  - each "Questions 1–4" group becomes an exercise set;
  - its instructions tell the type: which paragraph (matching information), TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN,
    complete the summary, sentences or notes (with the word limit), choose the correct letter, or answer the
    questions;
  - the ANSWER KEY gives the answers;
  - the explanation keeps where the answer is, the evidence and the editor's notes, as written;
  - "accept also “downward”" or "US spelling: color" add accepted answers;
  - groups it can't read are listed for the editor to add by hand.
- **Explanations keep their line breaks**, in the editor and for learners.
- A matching question whose options are only their letters (paragraphs A–G) shows no option list to learners:
  the letters are in the menus.

## Consequences

- Explanations are as the editor wrote them, often in Vietnamese. They aren't per language yet, unlike vocabulary
  sheets.
- "Choose TWO letters", labelling a diagram, and heading lists aren't read yet; they're reported and added by hand.
