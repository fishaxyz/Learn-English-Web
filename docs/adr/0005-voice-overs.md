# ADR 0005: Voice-overs for readings (ElevenLabs, approved by an editor)

- Status: accepted
- Date: 2026-11-25

## What editors and learners get

1. In the lesson editor, **Voice-over** lists the voices, which can be filtered by **Woman/Man** and **US/UK**. Each voice has a ▶ preview.
2. The editor picks up to 4 voices. The panel shows **what it costs before anything is made**: characters per voice × voices, and the characters left this month when the key can read that. A confirm dialog repeats the cost.
3. Each voice-over is made in the background. The editor listens, then **Approves** or **Deletes** it. To regenerate, delete it and make it again.
4. Only approved voice-overs are published. Learners see the tags ("🎧 Woman · UK") on lesson cards.
5. On the reading page, the player lets learners play, pause, seek, go back 5 s, change the speed (0.75×, 1× or 1.25×) and switch voices. There is no autoplay, and nothing downloads until they press play.
6. **Read-along:** the word being spoken is highlighted in the text.
7. On a word card, **🎧 As said in the text** plays that word or structure from the voice-over.

## Decisions

- **Speech is made in the Python worker, never in the API** (AGENTS.md §8).
  - The API queues one `tts.generate` job per voice. The worker claims it and calls ElevenLabs `with-timestamps` (`mp3_44100_128`).
  - The worker uploads the MP3 to a signed URL, then completes the job with the word timings.
  - Jobs use leases, claim tokens, idempotency keys and retries with backoff. After the last attempt the voice-over is marked failed and the error is shown to the editor.
  - The worker authenticates with `WORKER_SERVICE_TOKEN` (`x-worker-token` header). Only the worker can claim or complete jobs.
- **Voice tags come from ElevenLabs' labels.** Only voices labelled male/female with an American or British accent are offered.
- **Word timings** use the same code-point offsets as vocabulary links (blockId, start, end), so the player can find words in the rendered text.
  - The browser's CSS Custom Highlight API draws the highlight, so the text isn't re-rendered. Browsers without it still play the audio, just without the highlight.
- **The text a voice reads is hashed.** If the text changes after a voice-over is made, it's marked "text changed", and publishing an approved but stale voice-over is refused.
  - Unapproved voice-overs are dropped on publish. Starting a new draft copies the approved ones.
  - Published voice-overs are frozen, like the rest of a published revision.
- **Media storage sits behind a small interface** (`uploadUrl`, `downloadUrl`).
  - Today's driver stores files in a folder (`MEDIA_DIR`) and serves HMAC-signed, expiring URLs from the API, with byte ranges so players can seek.
  - An S3-compatible driver (Bunny, Backblaze B2, R2) can replace it in production. The host and its costs will be chosen later.
- **Tests never call ElevenLabs.** Without a key, the API offers four test voices and the worker makes silent audio, so the flow can be tried at no cost.

## Settings

`MEDIA_SIGNING_SECRET` (required) and `WORKER_SERVICE_TOKEN` are random values of at least 32 characters. `ELEVENLABS_API_KEY` is optional: without it, test mode is used. All of them live in `.env`, which is never committed.
