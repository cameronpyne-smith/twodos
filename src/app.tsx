import { Hono } from 'hono'
import { createTodo, deleteTodo, listTodos, toggleTodo } from './db.js'
import { Page, TodoList } from './views.js'

const app = new Hono()

const renderList = async () => {
  const { open, done } = await listTodos()
  return <TodoList open={open} done={done} />
}

app.get('/', async (c) => {
  const { open, done } = await listTodos()
  return c.html(<Page open={open} done={done} />)
})

app.get('/todos', async (c) => c.html(await renderList()))

app.post('/todos', async (c) => {
  const body = await c.req.parseBody()
  const title = String(body['title'] ?? '').trim()
  if (title) await createTodo(title.slice(0, 500))
  return c.html(await renderList())
})

app.post('/todos/:id/toggle', async (c) => {
  await toggleTodo(c.req.param('id'))
  return c.html(await renderList())
})

app.post('/todos/:id/delete', async (c) => {
  await deleteTodo(c.req.param('id'))
  return c.html(await renderList())
})

app.get('/healthz', (c) => c.text('ok'))

app.onError((err, c) => {
  console.error(err)
  return c.text(`Server error: ${err instanceof Error ? err.message : String(err)}`, 500)
})

export default app
