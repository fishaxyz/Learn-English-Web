import "server-only";
import { createDatabase } from "@english/database";
import { serverEnv } from "./env";

let database: ReturnType<typeof createDatabase> | undefined;

/** Used by Auth.js only (users, sessions, sign-in tokens). Lesson data always goes through the API. */
export const db = () =>
  (database ??= createDatabase(serverEnv().DATABASE_URL, { max: 5, applicationName: "dashboard" })).db;
