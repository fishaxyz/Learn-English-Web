import type { CodegenConfig } from "@graphql-codegen/cli";

// Schema-first (AGENTS.md §6): the .graphql files are the contract; every TypeScript type is generated from them.
const scalars = { ID: "string", DateTime: "string" };

const config: CodegenConfig = {
  schema: "schema/**/*.graphql",
  overwrite: true,
  generates: {
    // Shared types for any client (website, dashboard).
    "src/generated/schema-types.ts": {
      plugins: ["typescript"],
      config: { enumsAsTypes: true, scalars, useTypeImports: true },
    },
    // Resolver signatures for the API, typed against its own request context.
    "../../apps/api/src/generated/resolvers.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        enumsAsTypes: true,
        scalars,
        useTypeImports: true,
        contextType: "../context#GraphQLContext",
        useIndexSignature: false,
      },
    },
  },
};

export default config;
