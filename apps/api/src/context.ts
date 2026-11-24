import type { Database } from "@english/database";
import type { Logger } from "./logger";

/** What the API's resolvers get for each request. Request-scoped: nothing here is shared between users. */
export type GraphQLContext = {
  db: Database;
  log: Logger;
  requestId: string;
  /** Whether the database answers right now. */
  databaseReady: () => Promise<boolean>;
};

/** Long-lived things the server is built from. */
export type ApiDependencies = {
  db: Database;
  log: Logger;
  ping: () => Promise<boolean>;
};
