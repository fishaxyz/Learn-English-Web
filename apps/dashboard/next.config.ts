import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  // A self-contained server bundle for the Docker image.
  output: "standalone",
  // The monorepo root, so the standalone bundle includes workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  transpilePackages: ["@english/ui", "@english/config"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
