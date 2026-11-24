import { schema, type Database } from "@english/database";
import { eq } from "drizzle-orm";
import type { SiteModel } from "../models";

const DOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * The site a public request is for. The website's server sends `x-site-domain` from its own trusted domain
 * mapping (AGENTS.md §7); without it, the API's default site. Public data only depends on it, so a forged header
 * can show nothing more than another site's public lessons; editorial access always checks memberships.
 */
export function siteDomainOf(header: string | null, fallback: string): string {
  const value = header?.trim().toLowerCase();
  return value && value.length <= 253 && DOMAIN.test(value) ? value : fallback;
}

export async function siteByDomain(db: Database, domain: string): Promise<SiteModel | null> {
  const [row] = await db.select().from(schema.sites).where(eq(schema.sites.domain, domain)).limit(1);
  return row ?? null;
}
