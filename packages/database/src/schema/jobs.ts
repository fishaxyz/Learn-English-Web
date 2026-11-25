import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, jobStatus, updatedAt } from "./common";
import { sites, users } from "./identity";

/**
 * Background work for the Python worker (AGENTS.md §8): claimed atomically with FOR UPDATE SKIP LOCKED, held
 * under a lease, retried with backoff. A claim token stops a worker whose lease expired from finishing a job
 * someone else has since claimed. Delivery is at least once; handlers are idempotent.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    type: text().notNull(),
    status: jobStatus().notNull().default("QUEUED"),
    payloadJson: jsonb().notNull(),
    resultJson: jsonb(),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(3),
    availableAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    leaseUntil: timestamp({ withTimezone: true }),
    claimToken: uuid(),
    idempotencyKey: text().notNull(),
    lastError: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("jobs_site_idempotency").on(t.siteId, t.idempotencyKey),
    index("jobs_claimable").on(t.status, t.availableAt),
    check("jobs_attempts", sql`${t.attempts} >= 0 and ${t.maxAttempts} > 0`),
  ]
);
