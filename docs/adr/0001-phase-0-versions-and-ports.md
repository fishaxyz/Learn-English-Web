# ADR 0001: Phase 0 versions, ports and local conventions

- Status: accepted
- Date: 2026-11-24

## Context

AGENTS.md §2 fixes the stack and asks for stable, mutually compatible, pinned versions, checked rather than guessed. When Phase 0 was set up, some of the newest releases didn't work together, or were too new to trust.

## Decisions

| Choice | Instead of | Why |
|---|---|---|
| TypeScript **6.0.3** | 7.0 | typescript-eslint 8.72 supports TypeScript below 6.1 only. |
| graphql **16.15** | 17.1 | GraphQL Code Generator 8 and @graphql-tools 11 need Node 22.18 or newer, and this machine runs 22.15. graphql 16 works with Yoga 6 and codegen 7. Revisit when Node is upgraded. |
| @graphql-codegen/cli **7.4.6** | 8.0 | Same reason as graphql 16. |
| postgres (postgres.js) **3.4.9** | 4.x | 4.0 was released on 2026-10-29. Drizzle 0.45 is mature on 3.x. |
| ESLint **9.39.5** | 10.x | eslint-config-next's plugins (react, jsx-a11y, import) are proven on ESLint 9. |
| Node **22** (`.nvmrc`), images `node:22-alpine` | | The current LTS line. Images are pinned by digest (pulled on 2026-11-24). |
| Python **3.14**, image `python:3.14-slim`, uv 0.12 | | Matches the local interpreter. Dependencies are locked in `uv.lock`. |

Other decisions:

- **Ports:** website 3400, dashboard 3401, API 4400, Postgres 5434 on the host. Other local projects already use 3000, 3100, 3300, 8008, 8100 and 8200. Compose binds every port to 127.0.0.1.
- **Logging:** the API uses GraphQL Yoga's own logger (Hive Logger), so request logs and application logs share one format. `LOG_JSON=1` gives one JSON object per line. Secret-looking fields are redacted.
- **Resolver types live in the API.** GraphQL codegen writes `apps/api/src/generated/resolvers.ts`, typed against the API's request context, and `packages/graphql/src/generated/schema-types.ts` for clients. The schema files in `packages/graphql/schema` stay the single contract.
- **Health:**
  - liveness is `/health/live` (Yoga's built-in endpoint);
  - readiness is `/health/ready`, which checks the database;
  - the Next.js apps answer `/api/health/live` and `/api/health/ready`, which checks the API;
  - the worker writes a heartbeat file.
- **Tests and the database:** see ADR 0002. Tests always use real PostgreSQL; the PGlite idea was dropped.

- **Local Docker engine:** Colima (free, open source), installed with Homebrew together with the docker, docker-compose and docker-buildx CLIs. Docker Desktop also works; nothing in the project depends on which engine runs.

## Consequences

- Upgrading to TypeScript 7, graphql 17 or codegen 8 is a separate, deliberate change. The CI checks will show whether it works.
