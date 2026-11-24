import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** The migrations shipped with this package. The API image copies them next to its bundle. */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Applies pending migrations in order. A controlled deployment step (AGENTS.md §12): run it once before
 * the API starts, never from every replica.
 */
export async function runMigrations(url: string, folder = MIGRATIONS_DIR): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
