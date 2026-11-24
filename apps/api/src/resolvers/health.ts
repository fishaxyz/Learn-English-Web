import type { QueryResolvers } from "../generated/resolvers";

export const healthQuery: Pick<QueryResolvers, "health"> = {
  health: async (_parent, _args, ctx) => {
    const database = (await ctx.databaseReady()) ? "OK" : "DOWN";
    return { status: database === "OK" ? "OK" : "DOWN", database };
  },
};
