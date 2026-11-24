import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, siteRole } from "./common";

/** One brand. Everything tenant-owned carries site_id (AGENTS.md §5.6). */
export const sites = pgTable(
  "sites",
  {
    id: id(),
    domain: text().notNull().unique(),
    name: text().notNull(),
    defaultLocale: text().notNull().default("en"),
    createdAt: createdAt(),
  },
  (t) => [check("sites_domain_lowercase", sql`${t.domain} = lower(${t.domain})`)]
);

// --- Auth.js tables (database sessions). Shapes follow the Auth.js Drizzle adapter, so the dashboard's
// sign-in (Phase 2) can use them as they are. Learners don't have accounts until Phase 5.

export const users = pgTable("users", {
  id: id(),
  name: text(),
  email: text().notNull().unique(),
  emailVerified: timestamp({ withTimezone: true, mode: "date" }),
  image: text(),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

/** A signed-in session. Its token lives only in an HttpOnly cookie on the browser side. */
export const sessions = pgTable("sessions", {
  sessionToken: text().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

/** An editor's role on one site. No row: no access. */
export const siteMemberships = pgTable(
  "site_memberships",
  {
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: siteRole().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.userId] })]
);
