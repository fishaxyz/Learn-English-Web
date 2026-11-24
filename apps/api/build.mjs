// Bundles the API with its workspace packages (TypeScript source, so they must be inlined);
// every other package stays an import, resolved from node_modules at runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
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
