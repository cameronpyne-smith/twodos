# twodos

A shared todo app for couples and small groups.

**Current state: Milestone 3.3 — row layout and add flow.** Accounts, multiple lists,
membership and single-use invite links. Todos carry an assignee, a due date and notes, all
settable as you add them, with overdue highlighting and filter chips. Each person has a colour,
shown as an edge bar on the todos assigned to them, and any todo can be flagged important,
which floats it to the top. Done items collapse into a group that hides after 24 hours.

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

A row has exactly two controls: the checkbox toggles done, and tapping anywhere else opens
the editor. Delete lives inside the editor, so the only destructive action in the list is
two taps and a confirm away. Both controls are real `<button>`s and siblings rather than
nested, which keeps them independently focusable.

That shape exists because the row has to survive a narrow phone. Two 44px action buttons
were spending a quarter of a 360px screen, and the row is a flex chain — `.open` → `.body`
→ `.meta` → `.notes` — where **every level needs `min-width: 0`**. Miss one and its
`min-width: auto` floors that level at its content's min-content width; since `.notes` is
`white-space: nowrap`, that floor is the whole note on one line, which pushed the action
buttons past the edge of a row that is `overflow: hidden`, making them unreachable with no
scroll to recover them. Titles get `overflow-wrap: anywhere` for the same reason, so a
pasted booking URL wraps instead of being clipped.

**Adding sets every attribute at once.** The add form carries the same fields as the edit
form — important, due date, assignee, notes — hidden until the form has focus and revealed by
`.add:focus-within`. That is the whole mechanism: **no JavaScript and no state**. Focus the
title box and the options are there to set before submitting, so nothing has to be created and
then edited.

A burst still costs one keystroke per item: `this.reset()` clears the extra fields along with
the title, and focus returns to the title box, which keeps the panel open for the next one.
Because `:focus-within` covers descendants, tabbing into the due date or the assignee select
keeps it open too, and a value set while the panel is open can never be submitted invisibly —
reaching the title box or the Add button re-reveals the panel that holds it.

Both forms render one shared `.fields` block in the same order, so there is a single place to
style a field and a single order to learn.

Invalid values are **clamped, not rejected**: a date that isn't a date, or an assignee who
isn't a member of the list, is dropped and the todo is still created. Neither is reachable
through the UI — `type="date"` and a select of members see to that — so the only caller is a
tampered request, and there is no error state worth designing for something nobody can do by
accident. This mirrors `asColour()`, which validates and falls back rather than failing.

Editing swaps a single row for a form (`hx-target="closest li"`) rather than navigating.
Saving returns the fresh row and sets an `HX-Trigger-After-Swap: twodos:refresh` response header, so
the surrounding list re-renders and picks up any change in due-date ordering. The 10-second
background poll is filtered on `!document.querySelector('.editing')` so it cannot wipe out
a form someone is halfway through.

Assignee and due date are validated server-side: an assignee must be a member of the list,
which stops a tampered form assigning a todo to an arbitrary user id.

## Ordering

One `ORDER BY` produces both groups, and it is a **total order**:

```sql
order by (t.completed_at is not null),   -- open before done
         t.completed_at desc,            -- done: newest completed first
         t.important desc,               -- important first
         t.due_date asc nulls last,      -- then soonest due, undated last
         t.created_at desc,              -- then newest
         t.id                            -- total order
```

`t.id` is not decoration. Row order feeds the content hash (see Staying live), so if two rows
could tie on every other key, Postgres would be free to return them in either order and the
list would swap every ten seconds forever. Ties are reachable: `now()` is **transaction-scoped**
in Postgres, so any multi-row insert in one transaction gives every row an identical
`created_at`.

`important` sits *after* `completed_at desc`, so a completed important item does not jump to the
top of the Done group — Done is a record of what happened, not a priority list.

**Timestamps are read as UTC ISO text** via `to_char`, like `due_date`. They previously came back
as `Date` objects while typed as `string`, and the Done group was sorted with
`String(completed_at).localeCompare(...)` — which on `"Tue Sep 08 2026 …"` sorts by **day-of-week
alphabetically**. The declared types were lying, so nothing caught it. Ordering now happens
entirely in SQL and `splitTodos` only partitions.

## Important

`todos.important`, a boolean, set from a tick box in the edit form. It is a **sort key rather
than a section**: it sits above the due-date terms, so important todos rise to the top and are
ordered among themselves by exactly the same rule as everything else — due date first, newest
created for the undated. No extra markup, no empty-state question, and the rule is stated once.

It shows as a **yellow `!`** before the title, at the title's own font size so it is exactly as
tall as a capital letter, with the weight rather than the size carrying the emphasis. It pulses
gently, stops pulsing under `prefers-reduced-motion`, and goes muted and still once the item is
done.

Worth recording that this was chosen over a neutral star knowing the cost: **yellow cannot be
yellow on a light ground**, so light mode uses a dark gold (`#c99700`) and only dark mode gets
the real `#ffd54d`. That gold also sits near the `amber` user colour. Both were judged acceptable
for how much more noticeable it is, on a list where an important item is rare.

## Staying live

The list refreshes itself without polling being visible.

The container polls every **10 seconds**, but only while the app is on screen
(`document.visibilityState`) and only when no row is being edited — a swap would otherwise
discard a half-typed form. It also fetches immediately on `visibilitychange`, so coming back
to the app shows current data instead of waiting out the interval.

Both triggers share the same guard, held in one `IDLE` constant. The `visibilitychange` trigger
originally lacked the `.editing` check, so switching apps and back wiped an open form — the
same defect as the timer, in the one trigger that hadn't been given the guard.

**Unchanged responses do not swap.** Each rendered list carries a short content hash in
`hx-headers`; the poll sends it back as `X-Todo-Version`, and if it still matches the server
returns **`204 No Content`**, which htmx treats as nothing to do. So the common case — nothing
happened in the last ten seconds — costs one tiny request and touches no DOM at all.

The hash is taken over the **data about to be rendered** (row fields, the active filter, and
today's date), not over the finished HTML — the HTML contains the hash, so hashing it would be
circular. Deriving it from the data has a property an `updated_at` column would not: it cannot
go stale. There is no write path to forget to touch, because anything that would change the
markup necessarily changes the hash. Including today's date is what makes an item become
overdue at midnight, with no database write anywhere.

**Editing swaps a row, not the list.** The edit form targets `closest li`, so saving replaces
that row and nothing else, then fires `HX-Trigger-After-Swap: twodos:refresh` to let the
container re-render for any change in due-date ordering. Because the container was not itself
swapped, it still holds its pre-edit hash, so that refresh sees a mismatch and returns the full
list — the right behaviour, arrived at without special-casing.

**The Done group keeps its open state.** A single inherited `hx-vals` on `<main>` reports
whether it is expanded, so every request under it — poll, add, toggle, delete, save — carries
the value and the server renders `<details open>` to match. The state is deliberately excluded
from the content hash: including it would make expanding Done force a re-render, and would let
two viewers with different Done states invalidate each other's polls forever.

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
