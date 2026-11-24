# English Skills Platform

An SEO-friendly platform for learning English through Reading, Listening and Vocabulary. Working name: the site doesn't have a name yet.

- **[AGENTS.md](AGENTS.md)**: the architecture guide, and the source of truth for anyone building this.
- **[docs/ROADMAP.md](docs/ROADMAP.md)**: the build phases and their acceptance checks.
- **[docs/adr/](docs/adr/)**: decision records.

Status: **Phase 2** (reading slice) and the learner's vocabulary flow ([ADR 0004](docs/adr/0004-learner-vocabulary-flow.md)).

- **Editors** prepare words and structures in the word bank, then write and publish reading lessons.
- **Learners** read, choose words and structures to learn, study them highlighted in the text, and keep them in My words.

## What's here

| Path                     | What it is                                                                         | Local port       |
| ------------------------ | ---------------------------------------------------------------------------------- | ---------------- |
| `apps/website`           | Public learning site (Next.js)                                                     | 3400             |
| `apps/dashboard`         | Editorial dashboard (Next.js)                                                      | 3401             |
| `apps/api`               | GraphQL API (GraphQL Yoga): the only place with business rules and database writes | 4400             |
| `packages/database`      | Drizzle schema, migrations, connection                                             |                  |
| `packages/graphql`       | GraphQL schema (`schema/*.graphql`) and generated types                            |                  |
| `packages/ui`            | Shared React components                                                            |                  |
| `packages/config`        | Shared TypeScript config and environment validation                                |                  |
| `services/python-engine` | Python background worker; talks only to the API                                    |                  |
| `infrastructure/`        | Docker Compose and Dockerfiles                                                     | Postgres on 5434 |

The ports avoid the ones other local projects already use (3000, 3100, 3300, 8008, 8100, 8200).

## Prerequisites

- Node.js 22.15 or newer, and pnpm 10 (`corepack enable` sets up the pinned pnpm version).
- [uv](https://docs.astral.sh/uv/) for the Python worker.
- A Docker engine, to run everything together. This Mac uses [Colima](https://github.com/abiosoft/colima) (`colima start`); Docker Desktop also works.

## Start everything with Docker

```sh
cp .env.example .env      # then change POSTGRES_PASSWORD
pnpm docker:up            # builds the images and waits until every service is healthy
pnpm docker:ps            # status and health of each service
pnpm docker:down          # stop (the database volume is kept)
```

Load the sample lessons, and invite yourself to the dashboard:

```sh
pnpm docker:seed                                   # safe to run again
pnpm docker:invite --email you@example.com --role OWNER
```

On this computer (`APP_ENV=development`), the sign-in page also shows **Development sign-in**: one click for any invited account, no password. It never appears on a live site.

To sign in at <http://localhost:3401> without it, enter that address. In development (`APP_ENV=development`), the sign-in link is written to `.dev-mailbox/sign-in-links.jsonl` instead of being emailed. Open the newest link in that file.

After that first sign-in, open **Account** (your email at the top right) and set a password. From then on, sign in with your email and password.

To also offer **Continue with Google**, follow [docs/google-sign-in.md](docs/google-sign-in.md).

Then check:

- the website at <http://localhost:3400>;
- the dashboard at <http://localhost:3401>;
- the API's readiness at <http://localhost:4400/health/ready>;
- a lesson, by posting `{ publishedResources(first: 5) { nodes { slug title } } }` to <http://localhost:4400/graphql>.

## Develop without Docker

```sh
pnpm install
cp .env.example .env
pnpm dev                  # website, dashboard and API, reloading on change
```

The API needs a running PostgreSQL at `DATABASE_URL` (Docker's is on port 5434). Without one it still starts, but `/health/ready` answers 503.

```sh
pnpm db:migrate           # apply migrations to DATABASE_URL
pnpm db:seed              # sample lessons on the DEFAULT_SITE_DOMAIN site
```

To run the worker:

```sh
cd services/python-engine
uv sync --locked
GRAPHQL_API_URL=http://localhost:4400 uv run content-engine-worker
```

## Checks

```sh
pnpm check                # format, lint, type checks and tests (TypeScript)
pnpm build                # production builds of the API, website and dashboard
pnpm e2e                  # browser test against the running stack (needs the seed and an invited owner@example.test)
pnpm codegen              # regenerate GraphQL types after editing packages/graphql/schema
pnpm --filter @english/database db:generate --name=<change>   # a migration after editing the Drizzle schema

cd services/python-engine
uv run ruff check . && uv run ruff format --check . && uv run mypy src tests && uv run pytest
```

Database tests need `TEST_DATABASE_URL` (in `.env`): a server where they create and drop throwaway `test_*` databases. Never point it at production.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of these on every push. It also starts the full Docker Compose stack and checks every health endpoint.

## Health checks

| Service            | Liveness (process is up)                                          | Readiness (can do real work)                    |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------- |
| API                | `GET /health/live`                                                | `GET /health/ready`: the database answers       |
| Website, dashboard | `GET /api/health/live`                                            | `GET /api/health/ready`: the API is ready       |
| Worker             | heartbeat file, checked by `python -m content_engine.healthcheck` | logs `api status` when the API's status changes |

Health answers say only "up" or "down". They never include hostnames, versions or error details.

## Rules

- Work happens on `feature/…` or `fix/…` branches. Merges to `main` happen only on approval.
- Secrets go only in `.env`, which git ignores, or in the host's secret settings. `.env.example` holds placeholders only.
- Generated files (`**/generated/**`) are never edited by hand. Run `pnpm codegen` instead.
