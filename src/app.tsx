import { Hono } from 'hono'
import {
  clientIp,
  currentUser,
  emailProblem,
  endSession,
  generateToken,
  hashPassword,
  hashToken,
  LOGIN_ATTEMPT_LIMIT,
  passwordProblem,
  requireAuth,
  startSession,
  verifyPassword,
} from './auth.js'
import { ForgotPage, LoginPage, ResetPage, SignupPage } from './auth-views.js'
import { createTodo, deleteTodo, listTodos, toggleTodo } from './db.js'
import { sendPasswordReset } from './email.js'
import {
  consumePasswordReset,
  countRecentLoginAttempts,
  createPasswordReset,
  createUser,
  findUserByEmail,
  invalidateUserResets,
  pruneLoginAttempts,
  recordLoginAttempt,
  updatePassword,
  type User,
} from './users.js'
import { Page, TodoList } from './views.js'

const app = new Hono<{ Variables: { user: User } }>()

const field = (body: Record<string, unknown>, name: string) => String(body[name] ?? '').trim()

const renderList = async () => {
  const { open, done } = await listTodos()
  return <TodoList open={open} done={done} />
}

app.get('/login', async (c) => {
  if (await currentUser(c)) return c.redirect('/')
  return c.html(<LoginPage />)
})

app.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const email = field(body, 'email')
  const password = String(body['password'] ?? '')
  const ip = clientIp(c)

  if ((await countRecentLoginAttempts(email, ip)) >= LOGIN_ATTEMPT_LIMIT) {
    return c.html(
      <LoginPage email={email} error="Too many attempts. Wait 15 minutes and try again." />,
      429,
    )
  }

  await recordLoginAttempt(email, ip)

  const user = await findUserByEmail(email)
  const ok = user ? await verifyPassword(password, user.password_hash) : false

  if (!user || !ok) {
    return c.html(<LoginPage email={email} error="That email and password don't match." />, 401)
  }

  await startSession(c, user.id)
  return c.redirect('/')
})

app.get('/signup', async (c) => {
  if (await currentUser(c)) return c.redirect('/')
  return c.html(<SignupPage />)
})

app.post('/signup', async (c) => {
  const body = await c.req.parseBody()
  const email = field(body, 'email')
  const displayName = field(body, 'display_name')
  const password = String(body['password'] ?? '')

  const problem =
    emailProblem(email) ??
    passwordProblem(password) ??
    (displayName.length === 0 ? 'Tell us your name.' : null)

  if (problem) {
    return c.html(<SignupPage email={email} displayName={displayName} error={problem} />, 400)
  }

  if (await findUserByEmail(email)) {
    return c.html(
      <SignupPage
        email={email}
        displayName={displayName}
        error="That email already has an account."
      />,
      409,
    )
  }

  const user = await createUser(email, await hashPassword(password), displayName)
  await startSession(c, user.id)
  return c.redirect('/')
})

app.post('/logout', (c) => {
  endSession(c)
  return c.redirect('/login')
})

app.get('/forgot', (c) => c.html(<ForgotPage />))

app.post('/forgot', async (c) => {
  const body = await c.req.parseBody()
  const email = field(body, 'email')
  const user = await findUserByEmail(email)

  if (user) {
    const { token, hash } = generateToken()
    await invalidateUserResets(user.id)
    await createPasswordReset(user.id, hash)
    await sendPasswordReset(user.email, new URL(`/reset/${token}`, c.req.url).toString())
  }

  await pruneLoginAttempts()
  return c.html(<ForgotPage sent />)
})

app.get('/reset/:token', (c) => c.html(<ResetPage token={c.req.param('token')} />))

app.post('/reset/:token', async (c) => {
  const token = c.req.param('token')
  const body = await c.req.parseBody()
  const password = String(body['password'] ?? '')

  const problem = passwordProblem(password)
  if (problem) return c.html(<ResetPage token={token} error={problem} />, 400)

  const userId = await consumePasswordReset(hashToken(token))
  if (!userId) return c.html(<ResetPage token={token} expired />, 400)

  await updatePassword(userId, await hashPassword(password))
  await startSession(c, userId)
  return c.redirect('/')
})

app.get('/healthz', (c) => c.text('ok'))

app.use('/', requireAuth)
app.use('/todos', requireAuth)
app.use('/todos/*', requireAuth)

app.get('/', async (c) => {
  const { open, done } = await listTodos()
  return c.html(<Page open={open} done={done} user={c.get('user')} />)
})

app.get('/todos', async (c) => c.html(await renderList()))

app.post('/todos', async (c) => {
  const body = await c.req.parseBody()
  const title = field(body, 'title')
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

app.onError((err, c) => {
  console.error(err)
  return c.text(`Server error: ${err instanceof Error ? err.message : String(err)}`, 500)
})

export default app
