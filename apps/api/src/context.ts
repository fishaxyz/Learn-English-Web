import type { Database } from "@english/database";
import type { Actor } from "./auth/actor";
import type { Loaders } from "./graphql/loaders";
import type { Logger } from "./logger";
import type { SiteModel } from "./models";
import type { RateLimiter, RateLimitName } from "./modules/rate-limit";
import type { Revalidator } from "./modules/revalidate";

/** What the API's resolvers get for each request. Request-scoped: nothing here is shared between users. */
export type GraphQLContext = {
  db: Database;
  log: Logger;
  requestId: string;
  /** Whether the database answers right now. */
  databaseReady: () => Promise<boolean>;
  /** The public site this request is for. Throws NOT_FOUND for an unknown site. Cached per request. */
  site: () => Promise<SiteModel>;
  /** The signed-in editor, or null. Cached per request. */
  actor: () => Promise<Actor | null>;
  loaders: Loaders;
  /** Counts one request against a rate limit for this client; throws RATE_LIMITED when it's over. */
  limit: (name: RateLimitName) => void;
  /** Tells the website which cached pages to refresh (in the background). */
  revalidator: Revalidator;
};

/** Long-lived things the server is built from. */
export type ApiDependencies = {
  db: Database;
  log: Logger;
  ping: () => Promise<boolean>;
  /** The site used when a request doesn't name one. */
  defaultSiteDomain: string;
  rateLimiter: RateLimiter;
  revalidator: Revalidator;
  /** Believe x-forwarded-for (true only behind our own website server or proxy). */
  trustProxy: boolean;
};
