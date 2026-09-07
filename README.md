# twodos

A shared todo app for couples and small groups.

**Current state: Milestone 2 — lists and invites.** Accounts, multiple lists, membership,
and single-use invite links. Add, tick, untick and delete todos within a list. Done items
collapse into a group that hides after 24 hours.

## Stack

TypeScript · Hono · htmx · Neon Postgres · Vercel · raw SQL migrations · hand-written CSS.

No build step on the client: htmx is vendored into `public/` and the stylesheet is a
static asset. The server is bundled by esbuild into Vercel's Build Output API format
(see Deploying).

## Layout

```
src/app.tsx         Routes
src/auth.ts         Password hashing, session cookies, route guard
src/users.ts        User, reset-token and login-attempt queries
src/lists.ts        List, membership and invite queries
src/email.ts        Password-reset email over SMTP
src/views.tsx       Server-rendered JSX (Layout, Page, TodoList)
src/auth-views.tsx  Sign in, sign up, forgot and reset pages
src/db.ts           Todo queries
src/sql.ts          Lazy Neon connection
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

## Authentication

Email and password. Passwords are hashed with bcrypt; sessions are a signed JWT in an
httpOnly, SameSite=Lax cookie lasting 90 days.

Sessions are **deliberately not revocable** — the token carries only a user id, and the
only way to invalidate one is to rotate `JWT_SECRET`, which signs everyone out. This is
an accepted trade for a list shared with a partner and close family. Because of it, list
membership must never be stored in the token: it would go stale the moment someone is
added or removed, so membership is always checked against the database.

Login is rate limited to 10 attempts per 15 minutes, matched on **either** the email or
the IP, recorded in `login_attempts`. Once tripped, even the correct password is refused
until the window passes.

Password reset uses a single-use token, sha256-hashed at rest, expiring after an hour.
The forgot-password form returns the same response whether or not the address has an
account, so it cannot be used to discover who is registered.

There is no email verification. The audience is known, and an unverified state would
complicate every other flow for no benefit here.

### Sending reset emails

Set `SMTP_USER` and `SMTP_PASS` to a Gmail address and an
[App Password](https://support.google.com/accounts/answer/185833) — not the account
password, and it requires 2FA on the account.

**If they are unset, reset links are written to the server log instead of emailed.**
That keeps local development working without credentials, but it means password reset
is not actually self-serve in production until these are configured.

## Lists and sharing

A user belongs to any number of lists through `memberships`. Signing up normally creates
a list called Home; signing up through an invite joins that list instead and creates
nothing.

Navigation is one list at a time at `/list/:id`, with a switcher in the header. Each list
is a separate context, so there is no way to post to the wrong one by mistake.

**Every list-scoped route is guarded by membership**, and `list_id` is part of the `WHERE`
clause on every todo query — so a todo id from one list cannot be read, ticked or deleted
through another list, even by a member of both. Non-members get a 404 rather than a 403,
which avoids confirming that a list exists.

Invites are single-use links, sha256-hashed at rest, expiring after 7 days, consumed with
`UPDATE .. RETURNING` so they cannot be replayed. You send the link yourself — there is no
invite email, which keeps the system's only email dependency the password reset.

Opening an invite while signed out stores the token in a short-lived httpOnly cookie and
redeems it after signup or login.

## Deploying

Push to `main` and Vercel deploys automatically. Set these in the project's
environment variables: `DATABASE_URL`, `DATABASE_URL_POOLED`, `JWT_SECRET`, and
optionally `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`.

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
