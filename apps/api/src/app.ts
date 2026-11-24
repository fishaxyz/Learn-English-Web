import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { typeDefs } from "@english/graphql";
import { createSchema, createYoga } from "graphql-yoga";
import type { ApiDependencies, GraphQLContext } from "./context";
import { resolvers } from "./resolvers/index";

export type AppOptions = {
  corsOrigins: string[];
  /** Shows GraphiQL at /graphql in a browser. Development only. */
  graphiql: boolean;
};

export const LIVE_PATH = "/health/live";
export const READY_PATH = "/health/ready";

export function createApp(deps: ApiDependencies, options: AppOptions) {
  const yoga = createYoga({
    schema: createSchema<GraphQLContext>({ typeDefs, resolvers }),
    graphqlEndpoint: "/graphql",
    // Liveness: the process is up and serving. Says nothing about the database.
    healthCheckEndpoint: LIVE_PATH,
    graphiql: options.graphiql,
    landingPage: false,
    // Unexpected errors reach clients only as "Unexpected error."; details stay in the logs.
    maskedErrors: true,
    cors: options.corsOrigins.length
      ? { origin: options.corsOrigins, credentials: true, methods: ["GET", "POST"] }
      : false,
    logging: deps.log,
    context: ({ request }) => ({
      db: deps.db,
      log: deps.log,
      requestId: request.headers.get("x-request-id") ?? randomUUID(),
      databaseReady: deps.ping,
    }),
  });

  /** Readiness: the API can do real work, so the database must answer. */
  async function ready(res: ServerResponse) {
    const database = await deps.ping();
    res.writeHead(database ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ status: database ? "ok" : "unavailable", database: database ? "ok" : "down" }));
  }

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === READY_PATH && (req.method === "GET" || req.method === "HEAD")) return void ready(res);
    return yoga(req, res);
  };

  return { yoga, handler };
}
