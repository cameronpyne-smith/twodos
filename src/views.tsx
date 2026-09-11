import type { FC, PropsWithChildren } from 'hono/jsx'
import { asColour } from './colours.js'
import { daysUntil, formatDue } from './dates.js'
import {
  FILTERS,
  isOverdue,
  MAX_POINTS,
  pointsTier,
  type Filter,
  type Score,
  type Todo,
} from './db.js'
import type { List } from './lists.js'
import type { User } from './users.js'

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="color-scheme" content="light dark" />
      <title>{title}</title>
      <link rel="stylesheet" href="/app.css" />
      <script src="/htmx.min.js" defer></script>
      <script src="/ding.js" defer></script>
    </head>
    <body>{children}</body>
  </html>
)

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  mine: 'Mine',
  theirs: 'Theirs',
  unassigned: 'Anyone',
}

const query = (filter: Filter) => (filter === 'all' ? '' : `?filter=${filter}`)

const IDLE = "document.visibilityState === 'visible' && !document.querySelector('.editing')"

const POLL = [
  `every 10s [${IDLE}]`,
  `visibilitychange[${IDLE}] from:document`,
].join(', ')

const DONE_STATE = "js:{done: document.querySelector('.done-group')?.open ? 1 : 0}"

const CLOSE = [
  'click',
  "click[!this.closest('li').contains(event.target)] from:body",
  "keyup[key=='Escape'] from:body",
].join(', ')

const FLASH_RESET = "event.target.classList.remove('ok', 'bad')"

const FIELD_FLASH = [
  "this.classList.remove('ok', 'bad');",
  'void this.offsetWidth;',
  "this.classList.add(event.detail.successful ? 'ok' : 'bad');",
].join(' ')

const FLASH = [
  'const f = event.detail.requestConfig?.triggeringEvent?.target;',
  'if (f && f.form === this && f.name) {',
  "f.classList.remove('ok', 'bad');",
  'void f.offsetWidth;',
  "f.classList.add(event.detail.successful ? 'ok' : 'bad');",
  '}',
].join(' ')

function dueClass(todo: Todo, overdue: boolean, today: string): string {
  if (overdue) return 'due-col late'

  const delta = daysUntil(todo.due_date as string, today)
  return delta === 0 || delta === 1 ? 'due-col soon' : 'due-col'
}

export const TodoRow: FC<{ todo: Todo; listId: string; filter: Filter; today: string }> = ({
  todo,
  listId,
  filter,
  today,
}) => {
  const overdue = isOverdue(todo, today)
  const base = `/list/${listId}/todos/${todo.id}`
  const classes = ['todo']
  if (todo.completed_at) classes.push('done')
  if (overdue) classes.push('overdue')
  if (todo.important) classes.push('important')
  if (todo.assignee_colour) classes.push(`who-${asColour(todo.assignee_colour)}`)

  return (
    <li class={classes.join(' ')} data-points={todo.points}>
      <button
        class="tick"
        aria-label={todo.completed_at ? 'Mark as not done' : 'Mark as done'}
        hx-post={`${base}/toggle${query(filter)}`}
        hx-target="#todo-list"
        hx-swap="outerHTML"
      >
        <span class="box" aria-hidden="true"></span>
      </button>
      <button
        class="open"
        hx-get={`${base}/edit${query(filter)}`}
        hx-target="closest li"
        hx-swap="outerHTML"
      >
        <span class="body">
          <span class="title">
            {todo.important && (
              <span class="bang" role="img" aria-label="Important">
                !
              </span>
            )}
            {todo.title}
          </span>
          {(todo.assignee_name || todo.notes) && (
            <span class="meta">
              {todo.assignee_name && <span class="chip who">{todo.assignee_name}</span>}
              {todo.notes && <span class="notes">{todo.notes}</span>}
            </span>
          )}
        </span>
        {todo.due_date && (
          <span class={dueClass(todo, overdue, today)}>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <span>{formatDue(todo.due_date, today)}</span>
          </span>
        )}
        <span
          class={`pts ${pointsTier(todo.points)}`}
          aria-label={todo.points === 1 ? '1 point' : `${todo.points} points`}
        >
          {todo.points}
        </span>
      </button>
    </li>
  )
}

export const TodoEditRow: FC<{
  todo: Todo
  listId: string
  filter: Filter
  members: User[]
  error?: string
}> = ({ todo, listId, filter, members, error }) => {
  const base = `/list/${listId}/todos/${todo.id}`

  return (
    <li class="todo editing">
      <form
        class="fields"
        hx-post={`${base}/field${query(filter)}`}
        hx-trigger="change"
        hx-swap="none"
        hx-on:change={FLASH_RESET}
        hx-on--after-request={FLASH}
      >
        {error && <p class="row-error">{error}</p>}

        <label>
          Title
          <input
            type="text"
            name="title"
            value={todo.title}
            maxlength={500}
            autocomplete="off"
          />
        </label>

        <div class="opts">
          <label class="check">
            <input type="checkbox" name="important" checked={todo.important} />
            Important
          </label>
          <label class="points">
            Points
            <input
              type="number"
              name="points"
              value={todo.points}
              min={1}
              max={MAX_POINTS}
              step={1}
              inputmode="numeric"
            />
          </label>
        </div>

        <div class="pair">
          <label>
            Due
            <input type="date" name="due_date" value={todo.due_date ?? ''} />
          </label>
          <label>
            Assignee
            <select name="assignee_id">
              <option value="" selected={todo.assignee_id === null}>
                Anyone
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id} selected={m.id === todo.assignee_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Notes
          <textarea name="notes" rows={2} maxlength={2000}>
            {todo.notes ?? ''}
          </textarea>
        </label>

        <div class="row-actions">
          <button
            type="button"
            class="collapse"
            aria-label="Close"
            hx-post={`${base}${query(filter)}`}
            hx-trigger={CLOSE}
            hx-target="closest li"
            hx-swap="outerHTML"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            class="remove"
            aria-label="Delete"
            hx-post={`${base}/delete${query(filter)}`}
            hx-target="#todo-list"
            hx-swap="outerHTML"
            hx-confirm="Delete this todo?"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7" />
            </svg>
          </button>
        </div>
      </form>
    </li>
  )
}

export const AddForm: FC<{ listId: string; filter: Filter; members: User[] }> = ({
  listId,
  filter,
  members,
}) => (
  <form
    class="add"
    hx-post={`/list/${listId}/todos${query(filter)}`}
    hx-target="#todo-list"
    hx-swap="outerHTML"
    hx-on--after-request="this.reset(); this.querySelector('input[name=title]').focus()"
  >
    <div class="add-row">
      <input
        type="text"
        name="title"
        placeholder="Add a todo"
        autocomplete="off"
        required
        maxlength={500}
      />
      <button type="submit">Add</button>
    </div>

    <div class="add-extras fields">
      <div class="opts">
        <label class="check">
          <input type="checkbox" name="important" />
          Important
        </label>
        <label class="points">
          Points
          <input
            type="number"
            name="points"
            value={1}
            min={1}
            max={MAX_POINTS}
            step={1}
            inputmode="numeric"
          />
        </label>
      </div>

      <div class="pair">
        <label>
          Due
          <input type="date" name="due_date" />
        </label>
        <label>
          Assignee
          <select name="assignee_id">
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Notes
        <textarea name="notes" rows={2} maxlength={2000}></textarea>
      </label>
    </div>
  </form>
)

const Filters: FC<{ listId: string; filter: Filter; counts: Record<Filter, number> }> = ({
  listId,
  filter,
  counts,
}) => (
  <nav class="filters">
    {FILTERS.map((f) => (
      <button
        key={f}
        type="button"
        class={f === filter ? 'chip filter active' : 'chip filter'}
        aria-pressed={f === filter ? 'true' : 'false'}
        hx-get={`/list/${listId}/todos${query(f)}`}
        hx-target="#todo-list"
        hx-swap="outerHTML"
      >
        {FILTER_LABELS[f]} <span class="count">{counts[f]}</span>
      </button>
    ))}
  </nav>
)

const Scoreboard: FC<{ scores: Score[] }> = ({ scores }) => (
  <div class="scores">
    {scores.map((s) => (
      <span key={s.user_id} class={`score who-${asColour(s.colour)}`}>
        {s.display_name} <b>{s.points}</b>
      </span>
    ))}
    <span class="week">this week</span>
  </div>
)

export type TodoListProps = {
  listId: string
  filter: Filter
  open: Todo[]
  done: Todo[]
  counts: Record<Filter, number>
  total: number
  today: string
  version: string
  doneOpen: boolean
  scores: Score[]
}

export const TodoList: FC<TodoListProps> = ({
  listId,
  filter,
  open,
  done,
  counts,
  total,
  today,
  version,
  doneOpen,
  scores,
}) => (
  <div
    id="todo-list"
    hx-get={`/list/${listId}/todos${query(filter)}`}
    hx-trigger={POLL}
    hx-swap="outerHTML"
    hx-headers={JSON.stringify({ 'X-Todo-Version': version })}
  >
    {(total > 0 || scores.some((s) => s.points > 0)) && <Scoreboard scores={scores} />}

    {total > 0 && <Filters listId={listId} filter={filter} counts={counts} />}

    {open.length === 0 ? (
      <p class="empty">
        {total === 0 ? 'Nothing to do. Suspicious.' : 'Nothing here with that filter.'}
      </p>
    ) : (
      <ul class="list">
        {open.map((t) => (
          <TodoRow key={t.id} todo={t} listId={listId} filter={filter} today={today} />
        ))}
      </ul>
    )}

    {done.length > 0 && (
      <details class="done-group" open={doneOpen}>
        <summary>
          Done <span class="count">{done.length}</span>
        </summary>
        <ul class="list">
          {done.map((t) => (
            <TodoRow key={t.id} todo={t} listId={listId} filter={filter} today={today} />
          ))}
        </ul>
      </details>
    )}
  </div>
)

export const ListName: FC<{ name: string }> = ({ name }) => (
  <span id="list-name">{name}</span>
)

const ListSwitcher: FC<{ current: List; lists: List[] }> = ({ current, lists }) => {
  const others = lists.filter((l) => l.id !== current.id)

  return (
    <details class="switcher" name="header">
      <summary>
        <ListName name={current.name} />
      </summary>
      <nav>
        {others.map((l) => (
          <a key={l.id} href={`/list/${l.id}`}>
            {l.name}
          </a>
        ))}
        <a class="new" href="/lists/new">
          New list
        </a>
      </nav>
    </details>
  )
}

export const InviteLink: FC<{ url: string }> = ({ url }) => (
  <div id="invite" class="invite-result">
    <p>Send this link to whoever you want on the list. It works once, and expires in 7 days.</p>
    <input type="text" value={url} readonly onfocus="this.select()" />
  </div>
)

const SettingsMenu: FC<{ list: List; members: User[] }> = ({ list, members }) => (
  <details class="settings" name="header">
    <summary aria-label="List settings">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </summary>

    <div class="menu fields">
      <label>
        Name
        <input
          type="text"
          name="name"
          value={list.name}
          maxlength={60}
          autocomplete="off"
          hx-post={`/list/${list.id}/name`}
          hx-trigger="change"
          hx-target="#list-name"
          hx-swap="outerHTML"
          hx-on--after-request={FIELD_FLASH}
        />
      </label>

      <div class="sharing">
        <p class="menu-label">Sharing</p>
        <ul class="members">
          {members.map((m) => (
            <li key={m.id} class={`who-${asColour(m.colour)}`}>
              {m.display_name}
            </li>
          ))}
        </ul>
        <div id="invite">
          <button
            type="button"
            hx-post={`/list/${list.id}/invite`}
            hx-target="#invite"
            hx-swap="outerHTML"
          >
            Create invite link
          </button>
        </div>
      </div>
    </div>
  </details>
)

export const Page: FC<{
  user: User
  list: List
  lists: List[]
  members: User[]
  todos: TodoListProps
}> = ({ user, list, lists, members, todos }) => (
  <Layout title={`${list.name} · twodos`}>
    <header class="app-header">
      <div class="heading">
        <ListSwitcher current={list} lists={lists} />
        <SettingsMenu list={list} members={members} />
      </div>
      <div class="who">
        <a href="/profile">{user.display_name}</a>
        <form method="post" action="/logout">
          <button type="submit" class="link">
            Sign out
          </button>
        </form>
      </div>
    </header>

    <main hx-vals={DONE_STATE}>
      <AddForm listId={list.id} filter={todos.filter} members={members} />

      <TodoList {...todos} />
    </main>
  </Layout>
)

export const NewListPage: FC<{ error?: string; first?: boolean }> = ({ error, first }) => (
  <Layout title="New list · twodos">
    <main class="auth">
      <h1>twodos</h1>
      <h2>{first ? 'Create your first list' : 'New list'}</h2>
      {error && <p class="error">{error}</p>}
      <form method="post" action="/lists">
        <label>
          Name
          <input
            type="text"
            name="name"
            placeholder="Home"
            maxlength={60}
            autocomplete="off"
            required
          />
          <small>You can invite people once it exists.</small>
        </label>
        <button type="submit">Create list</button>
      </form>
    </main>
  </Layout>
)

export const JoinPage: FC<{ listName?: string; error?: string }> = ({ listName, error }) => (
  <Layout title="Join a list · twodos">
    <main class="auth">
      <h1>twodos</h1>
      {error ? (
        <>
          <h2>That invite doesn't work</h2>
          <p class="error">{error}</p>
          <p class="alt">
            <a href="/">Go to your lists</a>
          </p>
        </>
      ) : (
        <>
          <h2>You've been invited</h2>
          <p class="note">
            Sign in or create an account to join <strong>{listName}</strong>.
          </p>
          <p class="alt">
            <a href="/login">Sign in</a> · <a href="/signup">Create an account</a>
          </p>
        </>
      )}
    </main>
  </Layout>
)
