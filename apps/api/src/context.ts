import type { Database } from "@english/database";
import type { Actor } from "./auth/actor";
import type { Loaders } from "./graphql/loaders";
import type { Logger } from "./logger";
import type { SiteModel } from "./models";

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
};

/** Long-lived things the server is built from. */
export type ApiDependencies = {
  db: Database;
  log: Logger;
  ping: () => Promise<boolean>;
  /** The site used when a request doesn't name one. */
  defaultSiteDomain: string;
};
