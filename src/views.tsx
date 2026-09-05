import type { FC, PropsWithChildren } from 'hono/jsx'
import type { Todo } from './db'

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

const TodoRow: FC<{ todo: Todo }> = ({ todo }) => (
  <li class={todo.completed_at ? 'todo done' : 'todo'}>
    <button
      class="tick"
      aria-label={todo.completed_at ? 'Mark as not done' : 'Mark as done'}
      hx-post={`/todos/${todo.id}/toggle`}
      hx-target="#todo-list"
      hx-swap="outerHTML"
    >
      <span class="box" aria-hidden="true"></span>
      <span class="title">{todo.title}</span>
    </button>
    <button
      class="remove"
      aria-label="Delete"
      hx-post={`/todos/${todo.id}/delete`}
      hx-target="#todo-list"
      hx-swap="outerHTML"
      hx-confirm="Delete this todo?"
    >
      &times;
    </button>
  </li>
)

export const TodoList: FC<{ open: Todo[]; done: Todo[] }> = ({ open, done }) => (
  <div
    id="todo-list"
    hx-get="/todos"
    hx-trigger="every 30s [document.visibilityState === 'visible']"
    hx-swap="outerHTML"
  >
    {open.length === 0 ? (
      <p class="empty">Nothing to do. Suspicious.</p>
    ) : (
      <ul class="list">
        {open.map((t) => (
          <TodoRow key={t.id} todo={t} />
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
            <TodoRow key={t.id} todo={t} />
          ))}
        </ul>
      </details>
    )}
  </div>
)

export const Page: FC<{ open: Todo[]; done: Todo[] }> = ({ open, done }) => (
  <Layout title="twodos">
    <header class="app-header">
      <h1>twodos</h1>
    </header>

    <main>
      <form
        class="add"
        hx-post="/todos"
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

      <TodoList open={open} done={done} />
    </main>
  </Layout>
)
