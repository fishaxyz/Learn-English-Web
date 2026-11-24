import type { Resolvers } from "../generated/resolvers";
import { present } from "../rows";

export const identityResolvers: Resolvers = {
  Query: {
    viewer: async (_, __, ctx) => (await ctx.actor())?.user ?? null,
  },
  Viewer: {
    // Only ever the signed-in user's own memberships: `viewer` is the only way to reach a Viewer.
    memberships: async (_, __, ctx) => (await ctx.actor())?.memberships ?? [],
  },
  Membership: {
    site: async (m, _, ctx) => present(await ctx.loaders.site.load(m.siteId), "site"),
  },
};
