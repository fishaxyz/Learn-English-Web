# ADR 0002: Phase 1 data model and API

- Status: accepted
- Date: 2026-11-24

## Context

Phase 1 builds the shared content model (AGENTS.md §5) and the typed GraphQL API (§6) that every later phase uses. The guide fixes most of the shape. This record covers the choices it leaves open, and what was deliberately left for later.

## Decisions

### Database

- **The database enforces the rules too, not just the API.**
  - Composite foreign keys `(site_id, id)` stop any row linking to another site's rows.
  - Draft and published pointers may only reference the owner's own revisions.
  - Triggers freeze every PUBLISHED or SUPERSEDED revision, together with everything attached to it: exercise sets, questions, options, answer keys, topics, labels, media, collection items, and a sense's examples, pronunciations and glosses. The only change allowed is PUBLISHED → SUPERSEDED.
- **The pointer foreign keys are hand-written SQL** (`migrations/0002_integrity.sql`), not part of the Drizzle schema. Drizzle can't type two tables that reference each other. `drizzle-kit check` and CI's drift check still guard the rest of the schema.
- **A new draft copies everything** from the published revision: topics, labels, media, collection items and exercises (with answer keys). Published content is never shared with an editable draft.
- **Collections pin exact sense revisions.** Publishing a collection is refused while any pinned sense is still a draft. When a sense is republished later, the collection keeps its old revision. That is deliberate (§5.1).
- **pg_trgm** is enabled by the first migration, for fuzzy headword search. Passage search uses a generated `tsvector` column with a GIN index.

### Identity and authorization

- **Editor identity uses Auth.js-shaped tables** (`users`, `accounts`, `sessions`, `verification_tokens`), so the dashboard's sign-in in Phase 2 can use them through the Auth.js Drizzle adapter as they are.
- **The API reads `Authorization: Bearer <session token>`.** The dashboard's server forwards the Auth.js session token. Browsers never send it to the API, and the API doesn't use cookies, so it isn't exposed to CSRF.
- **Roles.** Permissions live in one table, `apps/api/src/auth/permissions.ts`:
  - editors write and submit;
  - reviewers return or publish;
  - admins also archive;
  - owners can do everything;
  - viewers only read.

  Editors cannot publish, which is the review step the owner asked for.
- **Not a member of the site? NOT_FOUND, not FORBIDDEN.** That way, site and resource ids can't be probed.

### API

- **Which site a request is for:** the `x-site-domain` header, which the website's server sets from its own domain mapping, falling back to `DEFAULT_SITE_DOMAIN`. Public reads only, so a forged header can reveal nothing more than another site's public lessons. Editorial access always checks the editor's membership.
- **Errors.**
  - The API's own errors carry a code (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `CONFLICT`, `NOT_FOUND`) and a `clientSafe` brand, and reach clients as they are.
  - Everything else is masked as "Unexpected error."
  - The check looks at the error's shape, not `instanceof`: the graphql library can load twice (ESM and CommonJS), and `instanceof` then gives the wrong answer.
- **Request limits are our own validation rules**:
  - query depth 10;
  - 20 aliases;
  - request bodies up to 100 KB, with Content-Length required;
  - no batching;
  - introspection off in production.

  GraphQL Armor wasn't used: it needs @envelop/core 5, and Yoga 6 uses 6.
- **No N+1 queries:** child lists come from request-scoped DataLoaders.
- **Pagination:** cursors encode `(publishedAt, revision id)`, and pages hold at most 50.
- **Grading** runs only on the server, in `gradePractice`.
  - Answer keys live in their own table, and no GraphQL type can reach them.
  - Typed answers are matched after Unicode NFC, straight apostrophes, collapsed spaces and (unless the key says otherwise) case folding. Nothing fuzzier.

### Tests and seed

- **Tests run against real PostgreSQL**, one throwaway database per test file, using `TEST_DATABASE_URL`. CI sets `REQUIRE_DATABASE_TESTS=1`, so these tests can't be skipped silently. This replaces the PGlite idea in ADR 0001.
- **The sample content is original.** It is published through the same services editors use. The listening lesson has a transcript and no audio: audio arrives in Phase 3, and none is faked.

## Left for later, on purpose

| What | When |
|---|---|
| Dashboard sign-in (Auth.js), and editorial queries and mutations for exercises, exam labels and media | Phase 2 |
| Rate limiting for `gradePractice` and `lexicalSearch` | Phase 2, before the public site goes live |
| Slug changes and their redirects (slugs are fixed at creation for now) | Phase 2 |
| Reading and listening detail tables, audio tracks, transcript segments, lexical annotations | Phases 2–3 |
| Worker service credentials and the job mutations | Phase 4 |
| PostgreSQL row-level security as defence in depth | When learner data arrives (Phase 5) |
