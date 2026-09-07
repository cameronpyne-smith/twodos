# twodos

A shared todo app for couples and small groups.

**Current state: Milestone 0 — walking skeleton.** One implicit list, no auth, no users.
Add, tick, untick and delete todos. Done items collapse into a group that hides after 24 hours.

## Stack

TypeScript · Hono · htmx · Neon Postgres · Vercel · raw SQL migrations · hand-written CSS.

No build step on the client: htmx is vendored into `public/` and the stylesheet is a
static asset. The server is bundled by esbuild into Vercel's Build Output API format
(see Deploying).

## Layout

```
src/app.tsx         Routes
src/views.tsx       Server-rendered JSX (Layout, Page, TodoList)
src/db.ts           Neon queries
src/vercel.ts       Production entry point (Node request listener)
src/dev.ts          Local dev server, serves public/ and the app
migrations/         Numbered .sql files, applied in order
scripts/build.ts    Bundles the server into .vercel/output
scripts/migrate.ts  Migration runner
scripts/vendor.ts   Copies htmx from node_modules into public/
public/             Static assets (app.css, htmx.min.js)
```

## Setup

**1. Create a Neon database** at <https://neon.tech>. Free tier, no card required.
Copy the pooled connection string.

**2. Configure:**

```sh
cp .env.example .env.local
# paste the connection string into DATABASE_URL
```

**3. Install and migrate:**

```sh
npm install
npm run vendor    # only needed after htmx.org is updated
npm run migrate
```

**4. Run:**

```sh
npm run dev       # http://localhost:3000
```

## Deploying

Push to `main` and Vercel deploys automatically. Set `DATABASE_URL` and
`DATABASE_URL_POOLED` in the project's environment variables.

`npm run build` produces Vercel's [Build Output API](https://vercel.com/docs/build-output-api/v3)
format in `.vercel/output`: a single self-contained ESM function plus `public/`
as static files, with a route table that serves static files first and sends
everything else to the function.

This is deliberate rather than incidental. Vercel's zero-config `api/` directory
only compiles files inside `api/` itself — TypeScript imported from `src/` is not
included, and the function crashes at boot with `ERR_MODULE_NOT_FOUND`. Generating
files into `api/` during the build does not help either, because Vercel plans the
build from the source tree before the build command runs. Bundling the server
ourselves sidesteps the platform's file tracing entirely.

To reproduce a deployment locally:

```sh
npm run build
npx vercel deploy --prebuilt --prod
```

Vercel Hobby is free and requires no card, but forbids commercial use.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Local server with hot reload |
| `npm run build` | Bundles the server into `.vercel/output` |
| `npm run migrate` | Applies pending migrations, tracked in `_migrations` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run vendor` | Re-copies `htmx.min.js` into `public/` |

## Migrations

Add a numbered file (`0002_add_lists.sql`) and run `npm run migrate`. Each file runs
in a transaction and is recorded in `_migrations`; applied files are never re-run.
Never edit a migration that has already been applied — add a new one.

## Next

Milestone 1 is auth: signup, login, logout, login rate limiting, password reset.
See the design notes for the full sequence.
