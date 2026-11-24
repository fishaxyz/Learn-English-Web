import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { typeDefs } from "@english/graphql";
import { createSchema, createYoga, maskError } from "graphql-yoga";
import { resolveActor, type Actor } from "./auth/actor";
import type { ApiDependencies, GraphQLContext } from "./context";
import { AppError, isClientSafe } from "./errors";
import { createLoaders } from "./graphql/loaders";
import { LIMITS, useLimits } from "./graphql/limits";
import type { SiteModel } from "./models";
import { clientOf } from "./modules/rate-limit";
import { siteByDomain, siteDomainOf } from "./modules/sites";
import { resolvers } from "./resolvers/index";

export type AppOptions = {
  corsOrigins: string[];
  /** Shows GraphiQL at /graphql in a browser. Development only. */
  graphiql: boolean;
  production: boolean;
};

export const LIVE_PATH = "/health/live";
export const READY_PATH = "/health/ready";

/** Caches an async value for the lifetime of one request. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => (value ??= load());
}

export function createApp(deps: ApiDependencies, options: AppOptions) {
  const yoga = createYoga({
    schema: createSchema<GraphQLContext>({ typeDefs, resolvers }),
    graphqlEndpoint: "/graphql",
    // Liveness: the process is up and serving. Says nothing about the database.
    healthCheckEndpoint: LIVE_PATH,
    graphiql: options.graphiql,
    landingPage: false,
    // Our own errors (NOT_FOUND, FORBIDDEN...) reach clients as they are; anything unexpected only as
    // "Unexpected error.", with the details kept in the logs.
    maskedErrors: {
      maskError: (error, message, isDev) => (isClientSafe(error) ? (error as Error) : maskError(error, message, isDev)),
    },
    // No batching: one operation per request keeps the limits meaningful.
    batching: false,
    cors: options.corsOrigins.length
      ? { origin: options.corsOrigins, credentials: false, methods: ["GET", "POST"] }
      : false,
    logging: deps.log,
    plugins: [useLimits({ production: options.production })],
    context: (initial): GraphQLContext => {
      const { request } = initial;
      const domain = siteDomainOf(request.headers.get("x-site-domain"), deps.defaultSiteDomain);
      const remote = (initial as { req?: IncomingMessage }).req?.socket.remoteAddress;
      const client = clientOf(request.headers.get("x-forwarded-for"), remote, deps.trustProxy);
      return {
        db: deps.db,
        log: deps.log,
        requestId: request.headers.get("x-request-id") ?? randomUUID(),
        databaseReady: deps.ping,
        site: once(async (): Promise<SiteModel> => {
          const site = await siteByDomain(deps.db, domain);
          if (!site) throw new AppError("NOT_FOUND", "Unknown site");
          return site;
        }),
        actor: once((): Promise<Actor | null> => resolveActor(deps.db, request.headers.get("authorization"))),
        loaders: createLoaders(deps.db),
        limit: (name) => deps.rateLimiter.hit(name, client),
        revalidator: deps.revalidator,
      };
    },
  });

  /** Readiness: the API can do real work, so the database must answer. */
  async function ready(res: ServerResponse) {
    const database = await deps.ping();
    res.writeHead(database ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ status: database ? "ok" : "unavailable", database: database ? "ok" : "down" }));
  }

  function reject(res: ServerResponse, status: number, message: string) {
    res.writeHead(status, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ errors: [{ message, extensions: { code: "VALIDATION_ERROR" } }] }));
  }

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === READY_PATH && (req.method === "GET" || req.method === "HEAD")) return void ready(res);
    if ((req.url ?? "").length > 10_000) return reject(res, 414, "The request URL is too long");
    if (req.method === "POST") {
      // Bodies must declare their size, and stay under the limit (AGENTS.md §6).
      const length = Number(req.headers["content-length"]);
      if (!Number.isFinite(length)) return reject(res, 411, "Content-Length is required");
      if (length > LIMITS.bodyBytes) return reject(res, 413, "The request body is too large");
    }
    return yoga(req, res);
  };

  return { yoga, handler };
}
