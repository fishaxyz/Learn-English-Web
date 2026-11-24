// `pnpm db:migrate`, and the API image's migrate step. Reads DATABASE_URL (and optional MIGRATIONS_DIR).
import { databaseUrl, parseEnv } from "@english/config/env";
import { z } from "zod";
import { runMigrations } from "../migrate";

const env = parseEnv(z.object({ DATABASE_URL: databaseUrl, MIGRATIONS_DIR: z.string().optional() }), process.env);
await runMigrations(env.DATABASE_URL, env.MIGRATIONS_DIR);
console.log(JSON.stringify({ level: "info", service: "migrate", msg: "migrations applied" }));
