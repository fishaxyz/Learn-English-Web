import { schema, type Database } from "@english/database";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Records who did what, in the same transaction as the change itself. No secrets or learner data in `data`. */
export async function audit(
  tx: Tx,
  event: {
    siteId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    data?: object;
  }
) {
  await tx.insert(schema.auditEvents).values({ ...event, data: event.data ?? null });
}
