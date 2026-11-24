// `pnpm invite --email you@example.com [--site localhost] [--role OWNER]`: lets someone sign in to the dashboard.
import { parseArgs } from "node:util";
import { databaseUrl, parseEnv } from "@english/config/env";
import { createDatabase, schema } from "@english/database";
import { z } from "zod";
import { inviteEditor } from "./invite";

const env = parseEnv(z.object({ DATABASE_URL: databaseUrl }), process.env);
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    site: { type: "string", default: "localhost" },
    role: { type: "string", default: "EDITOR" },
  },
});
const role = String(values.role).toUpperCase();
if (!values.email || !(schema.siteRole.enumValues as readonly string[]).includes(role)) {
  console.error(`Usage: invite --email <address> [--site <domain>] [--role ${schema.siteRole.enumValues.join("|")}]`);
  process.exit(2);
}
const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "invite" });
try {
  await inviteEditor(database.db, { domain: String(values.site), email: values.email, role: role as "EDITOR" });
  console.log(JSON.stringify({ level: "info", service: "invite", msg: `invited as ${role}`, site: values.site }));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await database.close();
}
