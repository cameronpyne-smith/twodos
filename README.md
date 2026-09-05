# twodos

A shared todo app for couples and small groups.

**Current state: Milestone 0 — walking skeleton.** One implicit list, no auth, no users.
Add, tick, untick and delete todos. Done items collapse into a group that hides after 24 hours.

## Stack

TypeScript · Hono · htmx · Neon Postgres · Vercel · raw SQL migrations · hand-written CSS.

No build step. htmx is vendored into `public/`, the stylesheet is a static asset.

## Layout

```
api/index.ts        Vercel entry point (wraps the Hono app)
src/app.tsx         Routes
src/views.tsx       Server-rendered JSX (Layout, Page, TodoList)
src/db.ts           Neon queries
src/dev.ts          Local dev server, serves public/ and the app
migrations/         Numbered .sql files, applied in order
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

Push to GitHub, import the repo at <https://vercel.com>, and set `DATABASE_URL`
as an environment variable in the project settings. `vercel.json` rewrites all
non-static routes to the Hono handler in `api/`.

Vercel Hobby is free and requires no card, but forbids commercial use.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Local server with hot reload |
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
