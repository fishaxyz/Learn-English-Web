# ADR 0008: IELTS-style questions, drafted by the local AI and approved by editors

- Status: accepted
- Date: 2026-11-25

## Question types

The Questions section follows the IELTS Reading task types. Each one is a branch of the question union in `apps/api/src/modules/assessment/schemas.ts`, with its own checks and marking.

| Type | IELTS task | Marks |
| --- | --- | --- |
| `SINGLE_CHOICE` | Multiple choice, one answer | 1 |
| `MULTIPLE_CHOICE` | "Choose TWO/THREE letters" | 1 per correct letter. Choosing more letters than asked scores 0. |
| `TRUE_FALSE_NOT_GIVEN` | Identifying information | 1 |
| `YES_NO_NOT_GIVEN` | Identifying the writer's views or claims | 1 |
| `MATCHING` | Matching headings, information (which paragraph), features, sentence endings | 1 per item. `reuse` lets an option be used more than once. |
| `COMPLETION` | Sentence, summary or note completion, with a word limit and an optional word box | 1 per gap |
| `SHORT_ANSWER` | Short-answer questions, with a word limit | 1 |
| `GAP_FILL` | The original free gap fill | All or nothing |

- **Typed answers** are normalized (case, spaces, curly quotes) and compared with the accepted answers listed in the key; there's no guessing at synonyms.
  - **Over the word limit is wrong**, even when the right words are in it, as in IELTS. Hyphenated words and numbers count as one word.
- **A question's points equal its marks.** The API sets them, so editors don't. `GRADING_VERSION` is now 2.
- **Answer keys stay private**, as before. Learners get the questions without answers, and the correct answers only come back from `gradePractice` after they submit.

## Suggested questions (admin review)

1. **Suggest questions** in the Questions section queues a `questions.suggest` job for the saved script. It needs a few sentences, and unsaved changes are saved first. Saving alone starts nothing, so the slow model only runs when asked.
2. The worker sends the whole text to the local language model (Qwen on llama.cpp), with paragraph letters A, B, C… It asks for these, in a fixed JSON shape:
   - 3 to 5 True/False/Not Given;
   - up to 3 Yes/No/Not Given, only for the writer's views;
   - 2 or 3 multiple choice, and one "choose TWO";
   - which paragraph contains each piece of information;
   - a heading for each paragraph, plus decoys;
   - sentence completions;
   - short answers.

   With the model on the CPU this takes about 1½ to 4 minutes.
3. **Weak drafts are dropped:**
   - The worker turns the answers into questions and drops what doesn't hold up: repeated options, unknown paragraph letters, and typed answers that aren't in the text or are over the word limit.
   - The API then checks each draft like an editor's question, and again requires typed answers to come from the script.
4. **Suggested questions** in the Questions section shows each draft the way learners will see it, with the answer key marked in green and the evidence quoted from the text.
   - Editors tick drafts and **Approve**, which adds them to the exercises, or **Remove** them.
   - Approved questions go into one set per IELTS task type, titled with its standard instructions (for example "True / False / Not Given: Do the following statements agree with the information given in the text?…").
   - They can then be edited like any other question.
5. **Nothing AI-written reaches learners** until an editor approves it and the lesson is published.

Without the language model, no questions are drafted, because they can't be made by rules alone. The list says so, and **Suggest again** retries once the model is running.

## Later

- A pass that checks each answer against the text (a second model call) before drafts are shown.
- Diagram and table completion, and listening question types.
