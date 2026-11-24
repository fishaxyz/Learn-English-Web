# ADR 0003: Phase 2, the reading slice and the editorial dashboard

- Status: accepted
- Date: 2026-11-24

## Decisions

### Sign-in

- **Auth.js v5** (`next-auth@5.0.0-beta.32`) with the Drizzle adapter and database sessions.
  - v4 is the "stable" line, but it doesn't fit the App Router or the shared `@auth/core` the adapter needs.
  - v5 carries a beta label, but it is Auth.js's documented route for Next.js.
  - We pin the exact version.
- **Who can sign in.** Only invited people: anyone with a role on a site, added with `pnpm invite` / `pnpm docker:invite`.
  - Uninvited addresses see the same "check your email" page and get no link, so the form reveals nothing about who has an account.
  - Links work once and expire after 15 minutes.
  - Sessions last 12 hours.
- **Where sign-in links go.**
  - Production: by email through any SMTP service (`EMAIL_SERVER`).
  - Development (`APP_ENV=development`): written to `.dev-mailbox/`.
  - With no `EMAIL_SERVER` in production, sign-in fails loudly instead of quietly writing links to disk.
- **Google sign-in** (added on `feature/google-sign-in`) is off until `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set; setup is in [docs/google-sign-in.md](../google-sign-in.md).
  - It needs a Google-verified, invited address, and links to that invited user.
  - Google always shows its account chooser.
  - Any other provider is refused.
  - The rules are in `apps/dashboard/lib/sign-in-rules.ts`, which is unit-tested.
- **How the dashboard talks to the API.** It forwards the session token as a Bearer token, from its server only. The browser holds just the HttpOnly cookie and never calls the API.
- **The dashboard connects to the database for Auth.js's tables only.** All lesson data still goes through the API.

### Content, caching and grading

- **Vocabulary links are a `lexical` mark in the rich text**, pointing at one exact sense revision.
  - Every save re-derives `lexical_annotations` from the marks. Offsets count Unicode code points within each block's text, and a hard break counts as one.
  - The links therefore never drift from the text.
  - Publishing is refused while a link points at an unpublished sense.
- **Caching.** The website renders per request, but its API data is cached by tag for at most five minutes.
  - After a publish or archive, the API POSTs the affected tags to `/api/revalidate`, authorized by `REVALIDATION_SECRET`, with retries.
  - The website expires those tags at once (`revalidateTag(tag, { expire: 0 })`), so an archived lesson disappears immediately.
- **Grading happens on the API, called from a Server Action.** The browser never sees answer keys.
  - The website passes the visitor's address in `x-forwarded-for`. The API trusts it only with `TRUST_PROXY=true`.
- **Rate limits** are kept in the API process's memory, per client: grading 30 a minute, search 60 a minute. A shared store will be needed once there is more than one API instance.

### Editor and SEO

- **The editor is Tiptap v3 (MIT)**, limited to the nodes and marks the API accepts.
  - Our own small extensions give every block a permanent id (repairing duplicates on split or paste) and add the vocabulary mark.
  - Gap-fill questions are written as `It takes [forty|40] minutes.`.
- **SEO.**
  - Canonical links on every page.
  - Filtered and paged lists are `noindex, follow`.
  - Lesson pages carry `LearningResource` JSON-LD describing only what the page shows.
  - The sitemap lists published reading lessons, levels and topics.

## Lessons from building it

- Tiptap's `useEditorState` returned nothing with React 19 and Next 16. The toolbar now re-renders on each transaction instead, and the editor's options are kept stable between renders.
- Tiptap's attribute objects aren't plain objects, so React can't send them to a Server Action as-is. The document is converted to plain JSON first.
- The local Docker VM's disk filled with build cache (about 37 GB), which crashed Postgres. Run `docker buildx prune -a -f` when `colima ssh -- df -h /mnt/lima-colima` gets high.

## Not done yet

| What | When |
|---|---|
| Two-step sign-in for editors (agreed earlier as required before going live) | Before production launch |
| Changing slugs, with redirects (slugs are fixed for now) | When editors need it |
| Listening and vocabulary pages on the website | Phase 3 |
| Media upload, audio | Phase 3 |
