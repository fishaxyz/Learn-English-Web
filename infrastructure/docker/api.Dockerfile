# syntax=docker/dockerfile:1
# The GraphQL API. Build context: the repository root.

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@english/api..."
RUN pnpm --filter @english/api build
# Only the API's production dependencies; workspace packages are already bundled into dist/.
RUN pnpm --filter @english/api deploy --prod --legacy /out
RUN cp -R apps/api/dist /out/dist && cp -R packages/database/migrations /out/migrations

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/migrations ./migrations
# Where the local media driver keeps files (a volume in Compose), writable by the unprivileged user.
RUN mkdir -p /data/media && chown node:node /data/media
USER node
EXPOSE 4400
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT:-4400}/health/live" >/dev/null || exit 1
CMD ["node", "dist/server.js"]
