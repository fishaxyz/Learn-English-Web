import { defineConfig } from "drizzle-kit";

// Only used to generate migration files from the schema; it never connects to a database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
});
