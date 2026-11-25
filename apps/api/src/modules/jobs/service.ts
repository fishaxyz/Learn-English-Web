import { schema, type Database } from "@english/database";
import { and, eq, sql } from "drizzle-orm";
import { conflict } from "../../errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type JobRow = typeof schema.jobs.$inferSelect;

export const LEASE_SECONDS = 300;

/** Adds a job; the same idempotency key on the same site never creates a second one. */
export async function enqueue(
  tx: Tx,
  job: {
    siteId: string;
    type: string;
    payload: object;
    idempotencyKey: string;
    createdBy: string | null;
    maxAttempts?: number;
  }
) {
  const [row] = await tx
    .insert(schema.jobs)
    .values({
      siteId: job.siteId,
      type: job.type,
      payloadJson: job.payload,
      idempotencyKey: job.idempotencyKey,
      createdBy: job.createdBy,
      maxAttempts: job.maxAttempts ?? 3,
    })
    .onConflictDoNothing({ target: [schema.jobs.siteId, schema.jobs.idempotencyKey] })
    .returning();
  return row ?? null;
}

/**
 * Claims the next job of the given types in one statement (AGENTS.md §8): a queued job that's due, or a running
 * one whose lease ran out (its worker died). FOR UPDATE SKIP LOCKED lets several workers claim in parallel
 * without taking the same job. Jobs that ran out of attempts while leased are failed first.
 */
export async function claimJob(db: Database, types: string[]): Promise<JobRow | null> {
  await db.execute(sql`
    update jobs set status = 'FAILED', last_error = coalesce(last_error, 'The worker stopped responding'),
      claim_token = null, lease_until = null, updated_at = now()
    where status = 'RUNNING' and lease_until < now() and attempts >= max_attempts`);
  await db.execute(sql`
    update audio_tracks set status = 'FAILED', error = 'The voice-over couldn''t be made. Try again, or choose another voice.'
    where status = 'GENERATING' and job_id in (select id from jobs where status = 'FAILED')`);
  const rows = await db.execute(sql`
    update jobs set status = 'RUNNING', attempts = attempts + 1, claim_token = gen_random_uuid(),
      lease_until = now() + make_interval(secs => ${LEASE_SECONDS}), updated_at = now()
    where id = (
      select id from jobs
      where type in (${sql.join(
        types.map((t) => sql`${t}`),
        sql`, `
      )})
        and ((status = 'QUEUED' and available_at <= now()) or (status = 'RUNNING' and lease_until < now()))
      order by available_at, created_at
      limit 1
      for update skip locked)
    returning id`);
  const id = (rows as unknown as { id: string }[])[0]?.id;
  if (!id) return null;
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  return job ?? null;
}

/** The running job this worker holds, locked for the rest of the transaction; CONFLICT if its claim is stale. */
export async function heldJob(tx: Tx | Database, jobId: string, claimToken: string): Promise<JobRow> {
  const [job] = await tx
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.claimToken, claimToken), eq(schema.jobs.status, "RUNNING")))
    .for("update");
  if (!job) throw conflict("This job is no longer held by this worker");
  return job;
}

export async function markSucceeded(tx: Tx, job: JobRow, result: object) {
  await tx
    .update(schema.jobs)
    .set({ status: "SUCCEEDED", resultJson: result, claimToken: null, leaseUntil: null, lastError: null })
    .where(eq(schema.jobs.id, job.id));
}

/**
 * Records a failure. Retryable ones go back in the queue after an exponential backoff with jitter, until the
 * attempts run out; permanent ones fail at once. Returns whether the job has now failed for good.
 */
export async function markFailed(tx: Tx, job: JobRow, error: string, retryable: boolean): Promise<boolean> {
  const final = !retryable || job.attempts >= job.maxAttempts;
  const backoffSeconds = Math.min(600, 10 * 2 ** (job.attempts - 1)) * (0.75 + Math.random() * 0.5);
  await tx
    .update(schema.jobs)
    .set({
      status: final ? "FAILED" : "QUEUED",
      lastError: error.slice(0, 1000),
      claimToken: null,
      leaseUntil: null,
      availableAt: final ? job.availableAt : new Date(Date.now() + backoffSeconds * 1000),
    })
    .where(eq(schema.jobs.id, job.id));
  return final;
}
