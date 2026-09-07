import type { FC, PropsWithChildren } from 'hono/jsx'
import type { Todo } from './db.js'
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
    </head>
    <body>{children}</body>
  </html>
)

const TodoRow: FC<{ todo: Todo; listId: string }> = ({ todo, listId }) => (
  <li class={todo.completed_at ? 'todo done' : 'todo'}>
    <button
      class="tick"
      aria-label={todo.completed_at ? 'Mark as not done' : 'Mark as done'}
      hx-post={`/list/${listId}/todos/${todo.id}/toggle`}
      hx-target="#todo-list"
      hx-swap="outerHTML"
    >
      <span class="box" aria-hidden="true"></span>
      <span class="title">{todo.title}</span>
    </button>
    <button
      class="remove"
      aria-label="Delete"
      hx-post={`/list/${listId}/todos/${todo.id}/delete`}
      hx-target="#todo-list"
      hx-swap="outerHTML"
      hx-confirm="Delete this todo?"
    >
      &times;
    </button>
  </li>
)

export const TodoList: FC<{ open: Todo[]; done: Todo[]; listId: string }> = ({
  open,
  done,
  listId,
}) => (
  <div
    id="todo-list"
    hx-get={`/list/${listId}/todos`}
    hx-trigger="every 30s [document.visibilityState === 'visible']"
    hx-swap="outerHTML"
  >
    {open.length === 0 ? (
      <p class="empty">Nothing to do. Suspicious.</p>
    ) : (
      <ul class="list">
        {open.map((t) => (
          <TodoRow key={t.id} todo={t} listId={listId} />
        ))}
      </ul>
    )}

    {done.length > 0 && (
      <details class="done-group">
        <summary>
          Done <span class="count">{done.length}</span>
        </summary>
        <ul class="list">
          {done.map((t) => (
            <TodoRow key={t.id} todo={t} listId={listId} />
          ))}
        </ul>
      </details>
    )}
  </div>
)

const ListSwitcher: FC<{ current: List; lists: List[] }> = ({ current, lists }) => {
  const others = lists.filter((l) => l.id !== current.id)

  return (
    <details class="switcher">
      <summary>{current.name}</summary>
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

export const SharePanel: FC<{ list: List; members: User[] }> = ({ list, members }) => (
  <details class="share">
    <summary>
      Sharing <span class="count">{members.length}</span>
    </summary>
    <ul class="members">
      {members.map((m) => (
        <li key={m.id}>{m.display_name}</li>
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
  </details>
)

export const Page: FC<{
  open: Todo[]
  done: Todo[]
  user: User
  list: List
  lists: List[]
  members: User[]
}> = ({ open, done, user, list, lists, members }) => (
  <Layout title={`${list.name} · twodos`}>
    <header class="app-header">
      <ListSwitcher current={list} lists={lists} />
      <div class="who">
        <span>{user.display_name}</span>
        <form method="post" action="/logout">
          <button type="submit" class="link">
            Sign out
          </button>
        </form>
      </div>
    </header>

    <main>
      <form
        class="add"
        hx-post={`/list/${list.id}/todos`}
        hx-target="#todo-list"
        hx-swap="outerHTML"
        hx-on--after-request="this.reset(); this.querySelector('input').focus()"
      >
        <input
          type="text"
          name="title"
          placeholder="Add a todo"
          autocomplete="off"
          required
          maxlength={500}
        />
        <button type="submit">Add</button>
      </form>

      <TodoList open={open} done={done} listId={list.id} />

      <SharePanel list={list} members={members} />
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
