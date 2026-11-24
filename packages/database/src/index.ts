export { createDatabase, type Database, type DatabaseOptions } from "./client";
// Migrations are run from "@english/database/migrate" only, so apps that just query don't bundle them.
export * as schema from "./schema/index";
