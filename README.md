# twodos

A shared todo app for couples and small groups.

**Current state: Milestone 3.1 — user colours.** Accounts, multiple lists, membership and
single-use invite links. Todos carry an assignee, a due date and notes, with overdue
highlighting and filter chips. Each person has a colour, shown as an edge bar on the todos
assigned to them. Done items collapse into a group that hides after 24 hours.

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
src/views.tsx       Server-rendered JSX (Layout, Page, TodoList, TodoRow)
src/auth-views.tsx  Sign in, sign up, forgot and reset pages
src/profile-views.tsx  Profile page and colour picker
src/db.ts           Todo queries, filtering, overdue test
src/dates.ts        Europe/London date handling and due-date formatting
src/colours.ts      The user colour palette and its assignment rules
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

**2. Create a `dev` branch** — Neon console → Branches → New branch, from `main`.
Local development must never point at production data; see [Environments](#environments).

**3. Configure:**

```sh
cp .env.example .env.local
# paste the dev branch's connection strings into DATABASE_URL and DATABASE_URL_POOLED
```

**4. Install and migrate:**

```sh
npm install
npm run vendor    # only needed after htmx.org is updated
npm run migrate
```

**5. Run:**

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

## Todos

| Field | Behaviour |
|---|---|
| `title` | Required |
| `notes` | Optional free text |
| `assignee_id` | Nullable — null means anyone, set means it is that person's |
| `due_date` | Optional, date-only |

A nullable assignee covers both "we need milk" and "you need to call the landlord" with
one column, and the feature degrades to a plain shared list if ignored. Filter chips are
All / Mine / Theirs / Anyone, counted over unfinished todos only.

**Dates are date-only and the app timezone is hardcoded to `Europe/London`.** Due dates
are read out of Postgres with `to_char(..., 'YYYY-MM-DD')` rather than as a `date`, because
the driver would otherwise hand back a `Date` at local midnight and reintroduce exactly
the offset bugs the date-only choice exists to avoid. "Today" comes from one helper in
`src/dates.ts`, so overdue and the "Today / Tomorrow / Fri / 12 Sep" labels can never
disagree.

Editing swaps a single row for a form (`hx-target="closest li"`) rather than navigating.
Saving returns the fresh row and sets an `HX-Trigger-After-Swap: twodos:refresh` response header, so
the surrounding list re-renders and picks up any change in due-date ordering. The 30-second
background poll is filtered on `!document.querySelector('.editing')` so it cannot wipe out
a form someone is halfway through.

Assignee and due date are validated server-side: an assignee must be a member of the list,
which stops a tampered form assigning a todo to an arbitrary user id.

## Colours

Every user has a `colour` on `users` — one of ten keys (`amber`, `teal`, …), not a hex value.
Each key resolves to a `--c-*` custom property with a light and a dark variant defined
together in `app.css`, so a colour is legible on both grounds with no contrast maths at
render time. Colour reaches the markup as a **class** (`who-teal`), never as an inline style,
which keeps every value in the stylesheet beside the tokens it belongs with.

It appears in exactly three places, all of them content rather than chrome: an inset bar on
the left edge of an assigned todo, the assignee pill, and the member pills in the Share panel.
It deliberately does **not** tint the filter chips or any control — the accent green means
*primary action* throughout the app, and a colour that means *belongs to a person* must not
compete with it.

**Who and when are separate channels.** The row's border still belongs to overdue; the edge
bar belongs to the assignee. Both are therefore visible on the same row, which matters because
an overdue todo assigned to a specific person is the one worth spotting. The bar is drawn with
`box-shadow: inset`, so it costs no layout shift and leaves the existing overdue rule alone.

**A colour is picked, and then it stays.** Signup assigns one at random so nobody starts
blank; after that the only thing that changes it is the person choosing a different one on
`/profile`. Nothing reassigns it — not joining a list, not anyone else's choice.

Two people in one list may therefore end up the same colour. That is allowed. The Share panel
shows everyone's colour, so a clash is visible and either person can change theirs in two taps
— which is a smaller cost than code that silently overrides a choice someone made on purpose.
The order in `src/colours.ts` is just the order the swatches appear in; it carries no logic.

The pill always names the person, so a clash degrades the colour to decoration rather than
making the row ambiguous.

Because todos now join `memberships` rather than `users` to reach the assignee, an assignee who
is no longer a member of the list renders with no name and no colour instead of a stale one.

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

## Environments

Two Neon branches, one codebase.

| | Branch | Connection strings live in |
|---|---|---|
| Local development | `dev` | `.env.local` (gitignored) |
| Production | `main` | Vercel environment variables |

A Neon branch is a copy-on-write fork of the database: creating one is instant and
free, and writes to it never touch the parent. This is what keeps local testing —
which creates and deletes throwaway accounts — out of real data.

`npm run migrate` prints the host it is about to touch before applying anything, so
a misconfigured `.env.local` is visible rather than silent. Migrations run against
`dev` first. Production is migrated with `npm run migrate:prod`, which reads
`.env.production.local` (also gitignored) instead — a separate file and a separate command,
so touching production is always a deliberate act rather than a stale `.env.local`.

The production deployment also sets `CANONICAL_HOST=twodos.pyne-smith.com`. Any
request arriving on another host — the `*.vercel.app` URL, for instance — is
308-redirected there, so invite and password-reset links only ever carry one origin.
Set it in Vercel's **Production** environment only; setting it for previews would
redirect every preview deployment to production.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Local server with hot reload |
| `npm run build` | Bundles the server into `.vercel/output` |
| `npm run migrate` | Applies pending migrations to the `dev` branch, tracked in `_migrations` |
| `npm run migrate:prod` | The same, against `.env.production.local` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run vendor` | Re-copies `htmx.min.js` into `public/` |

## Migrations

Add a numbered file (`0002_add_lists.sql`) and run `npm run migrate`. Each file runs
in a transaction and is recorded in `_migrations`; applied files are never re-run.
Never edit a migration that has already been applied — add a new one.

## Next

Milestone 4 is recurrence: a repeating todo rolls forward on the same row when
completed, anchored either to its previous due date or to the completion date.
See the design notes for the full sequence.
