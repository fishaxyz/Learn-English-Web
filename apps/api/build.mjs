// Bundles the API with its workspace packages (TypeScript source, so they must be inlined);
// every other package stays an import, resolved from node_modules at runtime.
import { build } from "esbuild";

await build({
  // The server, the one-shot migration step (run before it starts) and the local sample-content seed.
  entryPoints: {
    server: "src/server.ts",
    migrate: "../../packages/database/src/cli/migrate.ts",
    seed: "src/seed/run.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  plugins: [
    {
      name: "external-npm-packages",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith("@english/") ? undefined : { path: args.path, external: true }
        );
      },
    },
  ],
  logLevel: "info",
});
