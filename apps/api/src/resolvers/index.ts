import type { Resolvers } from "../generated/resolvers";
import { assessmentResolvers } from "./assessment";
import { healthQuery } from "./health";
import { identityResolvers } from "./identity";
import { lexiconResolvers } from "./lexicon";
import { resourceResolvers } from "./resources";
import { DateTime, ExercisePayload, RichText } from "./scalars";

/** Merges each domain's resolvers (AGENTS.md §16: one module per domain). */
function merge(...parts: Resolvers[]): Resolvers {
  const out: Record<string, Record<string, unknown>> = {};
  for (const part of parts) {
    for (const [type, fields] of Object.entries(part)) {
      out[type] = { ...out[type], ...(fields as Record<string, unknown>) };
    }
  }
  return out as Resolvers;
}

export const resolvers: Resolvers = {
  ...merge({ Query: { ...healthQuery } }, identityResolvers, resourceResolvers, lexiconResolvers, assessmentResolvers),
  DateTime,
  RichText,
  ExercisePayload,
};
