import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema/index";

export type DatabaseOptions = {
  /** Most connections the pool opens. */
  max?: number;
  /** Name shown in pg_stat_activity, to tell services apart. */
  applicationName?: string;
};

export function createDatabase(url: string, options: DatabaseOptions = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    connection: { application_name: options.applicationName ?? "english-skills" },
    onnotice: () => {},
  });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return {
    db,
    /** True when the database answers a trivial query within the timeout. */
    async ping(timeoutMs = 2000): Promise<boolean> {
      try {
        await Promise.race([
          db.execute(sql`select 1`),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
        ]);
        return true;
      } catch {
        return false;
      }
    },
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];
