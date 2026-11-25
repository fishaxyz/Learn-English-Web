import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "@english/database";
import type { Actor } from "./auth/actor";
import type { Loaders } from "./graphql/loaders";
import type { Logger } from "./logger";
import type { SiteModel } from "./models";
import type { RateLimiter, RateLimitName } from "./modules/rate-limit";
import type { MediaStorage } from "./modules/media/storage";
import type { Revalidator } from "./modules/revalidate";
import type { VoiceCatalog } from "./modules/tts/voices";

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
  storage: MediaStorage;
  voices: VoiceCatalog;
  /** True when the request carries the Python worker's service token (never an editor session). */
  isWorker: boolean;
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
  storage: MediaStorage;
  voices: VoiceCatalog;
  /** The worker's shared secret; worker operations are refused when it isn't set. */
  workerToken: string | undefined;
  /** Serves /media/... for the local storage driver; returns false for other paths. */
  mediaHandler?: (req: IncomingMessage, res: ServerResponse) => boolean;
};
