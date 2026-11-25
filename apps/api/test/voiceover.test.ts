import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { schema } from "@english/database";
import { testDatabaseUrl } from "@english/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ttsTextOf } from "../src/modules/audio/service";
import { codeOf, createHarness, type Harness } from "./helpers";

// No provider is called here: the stand-in voices are used, and the "worker" is this test.

const CREATE = `mutation($input: CreateResourceInput!) { createResource(input: $input) { localizations { id } } }`;
const REQUEST = `mutation($id: ID!, $voices: [ID!]!) { requestVoiceovers(localizationId: $id, voiceIds: $voices) { id status label } }`;
const CLAIM = `mutation { claimJob(types: ["tts.generate"]) { id type payload claimToken attempt } }`;
const UPLOAD = `mutation($job: ID!, $token: String!, $type: String!) { createJobUpload(jobId: $job, claimToken: $token, contentType: $type) { objectKey uploadUrl } }`;
const COMPLETE = `mutation($job: ID!, $token: String!, $result: JobPayload!) { completeJob(jobId: $job, claimToken: $token, result: $result) }`;
const FAIL = `mutation($job: ID!, $token: String!) { failJob(jobId: $job, claimToken: $token, error: "boom", retryable: true) }`;
const TRACKS = `query($id: ID!) { editorialResource(id: $id) { localizations { draft { audioTracks { id status label url stale wordTimings { blockId start end } } } } } }`;
const LESSON = `query($slug: String!) { resourceBySlug(kind: READING, slug: $slug) { ... on ReadingResource { audioTracks { label url durationMs wordTimings { blockId startMs } } } } }`;

const body = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", attrs: { id: "para-1" }, content: [{ type: "text", text }] }],
});

describe("text read by a voice", () => {
  it("joins blocks with blank lines and remembers where each starts, in code points", () => {
    const tts = ttsTextOf({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "para-1" }, content: [{ type: "text", text: "Zoë 🚆 left." }] },
        { type: "paragraph", attrs: { id: "para-2" }, content: [] },
        { type: "paragraph", attrs: { id: "para-3" }, content: [{ type: "text", text: "Then rain." }] },
      ],
    });
    expect(tts.text).toBe("Zoë 🚆 left.\n\nThen rain.");
    expect(tts.blocks).toEqual([
      { blockId: "para-1", start: 0, length: 11 },
      { blockId: "para-3", start: 13, length: 10 },
    ]);
  });
});

describe.skipIf(!testDatabaseUrl)("voice-overs", () => {
  let h: Harness;
  let server: Server;
  let origin: string;
  let resourceId: string;
  let localizationId: string;

  beforeAll(async () => {
    h = await createHarness();
    server = createServer(h.handler).listen(0);
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const [owner] = [h.people.ownerA];
    const created = await h.gql(
      CREATE,
      {
        input: {
          siteId: h.a.siteId,
          kind: "READING",
          slug: "voiced-essay",
          title: "Voiced",
          body: body("Her commute is long."),
        },
      },
      { token: owner.token }
    );
    localizationId = (created.data?.createResource as { localizations: { id: string }[] }).localizations[0]!.id;
    const [loc] = await h.t.db
      .select()
      .from(schema.resourceLocalizations)
      .where(eq(schema.resourceLocalizations.id, localizationId));
    resourceId = loc!.resourceId;
  }, 60_000);
  afterAll(async () => {
    server?.close();
    await h?.drop();
  });

  /** The test's media URLs point at a placeholder host; send them to this test's server instead. */
  const local = (url: string) => url.replace("http://media.test", origin);

  async function finish(job: {
    id: string;
    claimToken: string;
    payload: { text: string; blocks: { blockId: string }[] };
  }) {
    const upload = await h.gql(UPLOAD, { job: job.id, token: job.claimToken, type: "audio/wav" }, { worker: true });
    const { objectKey, uploadUrl } = upload.data?.createJobUpload as { objectKey: string; uploadUrl: string };
    const audioBytes = Buffer.alloc(4000, 1);
    const put = await fetch(local(uploadUrl), {
      method: "PUT",
      headers: { "content-type": "audio/wav" },
      body: audioBytes,
    });
    expect(put.status).toBe(201);
    return h.gql(
      COMPLETE,
      {
        job: job.id,
        token: job.claimToken,
        result: {
          objectKey,
          mimeType: "audio/wav",
          bytes: audioBytes.length,
          checksumSha256: createHash("sha256").update(audioBytes).digest("hex"),
          durationMs: 1500,
          modelId: null,
          wordTimings: [{ blockId: job.payload.blocks[0]!.blockId, start: 4, end: 11, startMs: 200, endMs: 700 }],
        },
      },
      { worker: true }
    );
  }

  it("makes one background job per chosen voice, which only the worker can claim", async () => {
    const r = await h.gql(
      REQUEST,
      { id: localizationId, voices: ["fake-woman-uk", "fake-man-us"] },
      { token: h.people.editorA.token }
    );
    expect(r.data?.requestVoiceovers).toEqual([
      { id: expect.any(String), status: "GENERATING", label: "Woman · UK" },
      { id: expect.any(String), status: "GENERATING", label: "Man · US" },
    ]);
    expect(codeOf(await h.gql(CLAIM, {}, { token: h.people.ownerA.token }))).toBe("FORBIDDEN"); // an editor isn't the worker
    expect(
      codeOf(await h.gql(REQUEST, { id: localizationId, voices: ["no-such-voice"] }, { token: h.people.editorA.token }))
    ).toBe("VALIDATION_ERROR");
  });

  it("lets the worker upload and complete a job; a stale claim can't complete it twice", async () => {
    const claimed = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as {
      id: string;
      claimToken: string;
      attempt: number;
      payload: { text: string; blocks: { blockId: string }[] };
    };
    expect(claimed.attempt).toBe(1);
    expect(claimed.payload.text).toBe("Her commute is long.");
    expect((await finish(claimed)).data?.completeJob).toBe(true);
    // A stale claim can neither get an upload address nor complete the job again.
    expect(
      codeOf(await h.gql(UPLOAD, { job: claimed.id, token: claimed.claimToken, type: "audio/wav" }, { worker: true }))
    ).toBe("CONFLICT");
    expect(
      codeOf(await h.gql(COMPLETE, { job: claimed.id, token: claimed.claimToken, result: {} }, { worker: true }))
    ).toBe("CONFLICT");

    const tracks = await h.gql(TRACKS, { id: resourceId }, { token: h.people.ownerA.token });
    const list = (
      tracks.data?.editorialResource as {
        localizations: { draft: { audioTracks: { status: string; url: string | null }[] } }[];
      }
    ).localizations[0]!.draft.audioTracks;
    expect(list.map((t) => t.status)).toEqual(["READY", "GENERATING"]);
    expect(list[0]!.url).toMatch(/^http:\/\/media\.test\/media\/.+\.wav\?exp=\d+&sig=/);
  });

  it("retries a failing job with backoff, then marks its voice-over failed", async () => {
    const claimed = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as { id: string; claimToken: string };
    await h.gql(FAIL, { job: claimed.id, token: claimed.claimToken }, { worker: true });
    const [job] = await h.t.db.select().from(schema.jobs).where(eq(schema.jobs.id, claimed.id));
    expect(job!.status).toBe("QUEUED");
    expect(job!.availableAt.getTime()).toBeGreaterThan(Date.now());
    // Out of attempts: the voice-over is marked failed, with a message for the editor.
    await h.t.db
      .update(schema.jobs)
      .set({ attempts: 3, availableAt: new Date(0) })
      .where(eq(schema.jobs.id, claimed.id));
    const again = (await h.gql(CLAIM, {}, { worker: true })).data?.claimJob as {
      id: string;
      claimToken: string;
      attempt: number;
    };
    expect(again.attempt).toBe(4);
    await h.gql(FAIL, { job: again.id, token: again.claimToken }, { worker: true });
    const [track] = await h.t.db.select().from(schema.audioTracks).where(eq(schema.audioTracks.jobId, claimed.id));
    expect(track!.status).toBe("FAILED");
  });

  it("publishes only approved voice-overs, and learners can stream them with seeking", async () => {
    const [ready] = await h.t.db.select().from(schema.audioTracks).where(eq(schema.audioTracks.status, "READY"));
    const approved = await h.gql(
      `mutation($id: ID!) { approveAudioTrack(id: $id) { status } }`,
      { id: ready!.id },
      { token: h.people.editorA.token }
    );
    expect(approved.data?.approveAudioTrack).toEqual({ status: "APPROVED" });

    const pub = await h.gql(
      `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { id } }`,
      { id: localizationId, v: 0 },
      { token: h.people.ownerA.token }
    );
    expect(pub.errors).toBeUndefined();
    expect(await h.t.db.select().from(schema.audioTracks).where(eq(schema.audioTracks.status, "FAILED"))).toEqual([]); // dropped

    const lesson = await h.gql(LESSON, { slug: "voiced-essay" });
    const [track] = (
      lesson.data?.resourceBySlug as { audioTracks: { label: string; url: string; durationMs: number }[] }
    ).audioTracks;
    expect(track).toMatchObject({
      label: "Woman · UK",
      durationMs: 1500,
      wordTimings: [{ blockId: "para-1", startMs: 200 }],
    });

    const ranged = await fetch(local(track!.url), { headers: { range: "bytes=100-199" } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe("bytes 100-199/4000");
    expect((await ranged.arrayBuffer()).byteLength).toBe(100);
    const forged = track!.url.replace(/sig=[^&]+/, "sig=forged");
    expect((await fetch(local(forged))).status).toBe(403);
  });

  it("refuses to publish an approved voice-over that no longer matches the text", async () => {
    const start = await h.gql(
      `mutation($id: ID!) { startDraft(localizationId: $id) { id } }`,
      { id: localizationId },
      { token: h.people.ownerA.token }
    );
    expect(start.errors).toBeUndefined();
    const update = await h.gql(
      `mutation($input: UpdateDraftInput!) { updateDraft(input: $input) { id } }`,
      { input: { localizationId, lockVersion: 0, body: body("Her commute is very long now.") } },
      { token: h.people.ownerA.token }
    );
    expect(update.errors).toBeUndefined();
    const tracks = await h.gql(TRACKS, { id: resourceId }, { token: h.people.ownerA.token });
    const copied = (
      tracks.data?.editorialResource as {
        localizations: { draft: { audioTracks: { status: string; stale: boolean }[] } }[];
      }
    ).localizations[0]!.draft.audioTracks;
    expect(copied).toEqual([expect.objectContaining({ status: "APPROVED", stale: true })]);
    const pub = await h.gql(
      `mutation($id: ID!, $v: Int!) { publishNow(localizationId: $id, lockVersion: $v) { id } }`,
      { id: localizationId, v: 1 },
      { token: h.people.ownerA.token }
    );
    expect(codeOf(pub)).toBe("CONFLICT");
  });
});
