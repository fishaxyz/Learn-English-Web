import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { sites, users } from "./identity";

/** Who changed what, and when. Rows are only ever added. Never put secrets or learner data in `data`. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    siteId: uuid().references(() => sites.id, { onDelete: "cascade" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    data: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_site_time").on(t.siteId, t.createdAt)]
);
