// Test helpers only: never imported by application code.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { createDatabase } from "./client";
import { runMigrations } from "./migrate";

/** Loads the repository's .env once, so local test runs find TEST_DATABASE_URL like the apps find theirs. */
function loadRepoEnv() {
  if (process.env.TEST_DATABASE_URL) return;
  for (let dir = process.cwd(); dir !== dirname(dir); dir = dirname(dir)) {
    const file = join(dir, ".env");
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
  }
}

loadRepoEnv();

/** The server to make throwaway databases on. Its user needs CREATEDB. Never a production server. */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/** CI sets REQUIRE_DATABASE_TESTS=1, so database tests can't be silently skipped there. */
if (!testDatabaseUrl && process.env.REQUIRE_DATABASE_TESTS === "1") {
  throw new Error("REQUIRE_DATABASE_TESTS is set but TEST_DATABASE_URL isn't");
}

/** A brand-new, fully migrated database for one test file. `drop()` removes it. */
export async function createTestDatabase() {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is not set");
  const name = `test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  const database = createDatabase(url.toString(), { max: 5, applicationName: "test" });
  return {
    ...database,
    url: url.toString(),
    async drop() {
      await database.close();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    },
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
