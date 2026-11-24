import type { Resolvers } from "../generated/resolvers";
import { healthQuery } from "./health";

export const resolvers: Resolvers = {
  Query: { ...healthQuery },
};
