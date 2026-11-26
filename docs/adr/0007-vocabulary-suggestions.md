# ADR 0007: Suggested vocabulary from the script

- Status: accepted
- Date: 2026-11-25

## What editors see

1. **Suggest vocabulary** in the Lexical vocabulary section starts a background search of the saved script. The script must not be empty, and unsaved changes are saved first. On the New reading page, the button saves the lesson, then opens its page. The Vocabulary section shows "Looking for words, phrases and idioms…" while it runs.
2. Suggestions appear in **Suggested for this script**. Each shows:
   - its base form (such as "give up" or "a piece of cake") and its kind (word, phrasal verb, idiom, collocation, pattern);
   - a CEFR level;
   - the sentence from the script, with the item in bold;
   - a short draft meaning;
   - whether it's already in the word bank or new.
3. Tick items and **Approve selected** or **Remove selected**, or use the ✓ and ✕ buttons on each item.
   - **Approve** links the item in the script as a **key word**, so it shows in bold in the editor and first for learners. An item new to the word bank is added there as a **draft**, with the suggested meaning and the sentence as its example.
   - **For this phase,** publishing the lesson also publishes the draft meanings it links to: approving the suggestion counts as checking it. A meaning can still be edited in Lexical Studio and published again; lessons keep the revision they were published with. (Before, publishing was refused until each meaning had been published in Lexical Studio. That stricter rule can return with an in-lesson "check meaning" step.)
   - **Remove** takes an item off the list. The same item isn't suggested again for that lesson.
4. Saving a changed script drops the pending suggestions made for the old text, but starts nothing: the button does. Decisions already made are kept. **Suggest again** runs a new search on the current text.

## How suggestions are made (the worker's `vocab.suggest` job)

- **spaCy** (`en_core_web_sm`) finds phrasal verbs and content words. **wordfreq** keeps the words that are rarer than the lesson's level and gives a first level guess.
- **The local language model** (Qwen3-14B on llama.cpp, on this Mac) is given one paragraph at a time. It finds idioms, collocations, fixed phrases and sentence patterns, and writes short meanings and levels for the words.
  - Each item must quote the text exactly. An item that isn't really in the text is dropped, because suggestions are never invented.
  - A word inside a longer expression isn't suggested on its own.
- The job renews its lease before each model call (`renewJobLease`), because a paragraph takes about a minute on the CPU.
- **Without the model** (the server isn't running), the job still finishes, with word-frequency suggestions only: no idioms and no meanings. The list says so.
- **The API keeps only what's really there.**
  - Offsets must match the text (code points), suggestions can't overlap existing links, removed items stay removed, and results for a text that has since changed are dropped.
  - Each suggestion is matched to the word bank by its normalized headword.

## Running the language model

```sh
~/llama.cpp/build/bin/llama-server -m ~/models/Qwen3-14B-Q4_K_M.gguf --alias qwen3-14b \
  --host 127.0.0.1 --port 8400 -ngl 0 --device none -c 8192 --jinja -t 8
```

- The worker reaches it at `http://host.docker.internal:8400/v1` (`LLM_BASE_URL`). An empty `LLM_BASE_URL` turns it off; the end-to-end tests do this.
- It uses about 9 GB of memory while running. Stop it with `pkill -f llama-server` when you're not preparing lessons.
- Metal (the GPU) crashes on macOS 13.4, so it runs on the CPU (`-ngl 0 --device none`).

## Later

- CEFR-J word levels (with credit) to replace the word-frequency level guess.
- Vietnamese translations suggested along with meanings.
