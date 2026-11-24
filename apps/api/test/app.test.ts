import type { Database } from "@english/database";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { MemoryLogWriter } from "graphql-yoga";
import { createLogger } from "../src/logger";

const quiet = createLogger("error", "test", [new MemoryLogWriter()]);

function app(databaseUp: boolean) {
  return createApp(
    { db: {} as Database, log: quiet, ping: async () => databaseUp, defaultSiteDomain: "localhost" },
    { corsOrigins: [], graphiql: false, production: false }
  ).yoga;
}

const healthQuery = (yoga: ReturnType<typeof app>) =>
  yoga.fetch("http://test/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ health { status database } }" }),
  });

describe("health", () => {
  it("reports OK when the database answers", async () => {
    const res = await healthQuery(app(true));
    expect(await res.json()).toEqual({ data: { health: { status: "OK", database: "OK" } } });
  });

  it("reports DOWN when the database doesn't", async () => {
    const res = await healthQuery(app(false));
    expect(await res.json()).toEqual({ data: { health: { status: "DOWN", database: "DOWN" } } });
  });

  it("answers the liveness check without touching the database", async () => {
    const res = await app(false).fetch("http://test/health/live");
    expect(res.status).toBe(200);
  });

  it("hides unexpected errors from clients", async () => {
    const yoga = createApp(
      {
        db: {} as Database,
        log: quiet,
        ping: async () => {
          throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");
        },
        defaultSiteDomain: "localhost",
      },
      { corsOrigins: [], graphiql: false, production: false }
    ).yoga;
    const body = JSON.stringify(await (await healthQuery(yoga)).json());
    expect(body).toContain("Unexpected error");
    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("10.0.0.5");
  });
});
