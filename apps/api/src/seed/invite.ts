import { schema, type Database } from "@english/database";
import { eq, sql } from "drizzle-orm";
import { one } from "../rows";

type Role = (typeof schema.siteRole.enumValues)[number];

/**
 * Gives an email address a role on a site, creating the user if needed. The only way in: the dashboard's
 * sign-in accepts invited addresses only (AGENTS.md §10). Running it again changes the role.
 */
export async function inviteEditor(db: Database, input: { domain: string; email: string; role: Role }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That isn't an email address");
  return db.transaction(async (tx) => {
    const [site] = await tx.select().from(schema.sites).where(eq(schema.sites.domain, input.domain.toLowerCase()));
    if (!site) throw new Error(`No site with the domain ${input.domain}`);
    const [existing] = await tx
      .select()
      .from(schema.users)
      .where(eq(sql`lower(${schema.users.email})`, email));
    const user = existing ?? one(await tx.insert(schema.users).values({ email }).returning());
    await tx
      .insert(schema.siteMemberships)
      .values({ siteId: site.id, userId: user.id, role: input.role })
      .onConflictDoUpdate({
        target: [schema.siteMemberships.siteId, schema.siteMemberships.userId],
        set: { role: input.role },
      });
    await tx.insert(schema.auditEvents).values({
      siteId: site.id,
      actorUserId: null,
      action: "member.invited",
      entityType: "user",
      entityId: user.id,
      data: { role: input.role },
    });
    return { userId: user.id, siteId: site.id };
  });
}
