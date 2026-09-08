import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import {
  baseUrl,
  clientIp,
  currentUser,
  emailProblem,
  endSession,
  generateToken,
  hashPassword,
  hashToken,
  isHttps,
  LOGIN_ATTEMPT_LIMIT,
  passwordProblem,
  requireAuth,
  startSession,
  verifyPassword,
} from './auth.js'
import { ForgotPage, LoginPage, ResetPage, SignupPage } from './auth-views.js'
import { isColour } from './colours.js'
import { isValidDate, londonToday } from './dates.js'
import {
  applyFilter,
  createTodo,
  deleteTodo,
  findTodo,
  listTodos,
  parseFilter,
  splitTodos,
  todoVersion,
  toggleTodo,
  updateTodo,
  type Filter,
} from './db.js'
import { sendPasswordReset } from './email.js'
import { ColourPicker, ProfilePage } from './profile-views.js'
import {
  acceptInvite,
  createInvite,
  createList,
  findList,
  findListForUser,
  listsForUser,
  membersOfList,
  peekInvite,
  type List,
} from './lists.js'
import {
  consumePasswordReset,
  countRecentLoginAttempts,
  createPasswordReset,
  createUser,
  findUserByEmail,
  invalidateUserResets,
  pruneLoginAttempts,
  recordLoginAttempt,
  updateColour,
  updatePassword,
  type User,
} from './users.js'
import {
  InviteLink,
  JoinPage,
  NewListPage,
  Page,
  TodoEditRow,
  TodoList,
  TodoRow,
  type TodoListProps,
} from './views.js'

type Env = { Variables: { user: User; list: List } }

const app = new Hono<Env>()

const INVITE_COOKIE = 'pending_invite'

const field = (body: Record<string, unknown>, name: string) => String(body[name] ?? '').trim()

app.use('*', async (c, next) => {
  const canonical = process.env.CANONICAL_HOST
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host')

  if (canonical && host && host !== canonical) {
    const url = new URL(c.req.url)
    return c.redirect(`https://${canonical}${url.pathname}${url.search}`, 308)
  }

  await next()
})

const doneOpen = (c: Context) => c.req.query('done') === '1'

async function todoProps(
  listId: string,
  userId: string,
  filter: Filter,
  done_open: boolean,
): Promise<TodoListProps> {
  const todos = await listTodos(listId)
  const unfinished = todos.filter((t) => t.completed_at === null)
  const { open, done } = splitTodos(applyFilter(todos, filter, userId))
  const today = londonToday()

  return {
    listId,
    filter,
    open,
    done,
    total: todos.length,
    today,
    version: todoVersion(todos, filter, today),
    doneOpen: done_open,
    counts: {
      all: unfinished.length,
      mine: applyFilter(unfinished, 'mine', userId).length,
      theirs: applyFilter(unfinished, 'theirs', userId).length,
      unassigned: applyFilter(unfinished, 'unassigned', userId).length,
    },
  }
}

const renderList = async (c: Context<Env>) => {
  const props = await todoProps(
    c.get('list').id,
    c.get('user').id,
    parseFilter(c.req.query('filter')),
    doneOpen(c),
  )
  return <TodoList {...props} />
}

async function redeemPendingInvite(c: Context, userId: string) {
  const token = getCookie(c, INVITE_COOKIE)
  if (!token) return null
  deleteCookie(c, INVITE_COOKIE, { path: '/' })
  return acceptInvite(hashToken(token), userId)
}

async function landing(userId: string): Promise<string> {
  const lists = await listsForUser(userId)
  const first = lists[0]
  return first ? `/list/${first.id}` : '/lists/new'
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
  const joined = await redeemPendingInvite(c, user.id)
  return c.redirect(joined ? `/list/${joined}` : await landing(user.id))
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

  const joined = await redeemPendingInvite(c, user.id)
  if (joined) return c.redirect(`/list/${joined}`)

  const list = await createList('Home', user.id)
  return c.redirect(`/list/${list.id}`)
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
    await sendPasswordReset(user.email, new URL(`/reset/${token}`, baseUrl(c)).toString())
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
  return c.redirect(await landing(userId))
})

app.get('/invite/:token', async (c) => {
  const token = c.req.param('token')
  const listId = await peekInvite(hashToken(token))

  if (!listId) {
    return c.html(<JoinPage error="It has already been used, or it expired." />, 410)
  }

  const user = await currentUser(c)
  if (!user) {
    setCookie(c, INVITE_COOKIE, token, {
      httpOnly: true,
      secure: isHttps(c),
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
    const list = await findList(listId)
    return c.html(<JoinPage listName={list?.name ?? 'a shared list'} />)
  }

  if (await findListForUser(listId, user.id)) return c.redirect(`/list/${listId}`)

  const joined = await acceptInvite(hashToken(token), user.id)
  if (!joined) return c.html(<JoinPage error="It has already been used, or it expired." />, 410)
  return c.redirect(`/list/${joined}`)
})

app.get('/healthz', (c) => c.text('ok'))

app.use('/', requireAuth)
app.use('/profile', requireAuth)
app.use('/profile/*', requireAuth)
app.use('/lists', requireAuth)
app.use('/lists/*', requireAuth)
app.use('/list/*', requireAuth)

app.get('/', async (c) => c.redirect(await landing(c.get('user').id)))

app.get('/profile', (c) => c.html(<ProfilePage user={c.get('user')} />))

app.post('/profile/colour/:colour', async (c) => {
  const colour = c.req.param('colour')
  const user = c.get('user')

  if (!isColour(colour)) return c.html(<ColourPicker current={user.colour} />, 400)

  await updateColour(user.id, colour)
  return c.html(<ColourPicker current={colour} />)
})

app.get('/lists/new', async (c) => {
  const lists = await listsForUser(c.get('user').id)
  return c.html(<NewListPage first={lists.length === 0} />)
})

app.post('/lists', async (c) => {
  const body = await c.req.parseBody()
  const name = field(body, 'name')
  if (!name) return c.html(<NewListPage error="Give the list a name." />, 400)

  const list = await createList(name.slice(0, 60), c.get('user').id)
  return c.redirect(`/list/${list.id}`)
})

app.use('/list/:id', async (c, next) => {
  const list = await findListForUser(c.req.param('id'), c.get('user').id)
  if (!list) return c.notFound()
  c.set('list', list)
  await next()
})

app.use('/list/:id/*', async (c, next) => {
  const list = await findListForUser(c.req.param('id'), c.get('user').id)
  if (!list) return c.notFound()
  c.set('list', list)
  await next()
})

app.get('/list/:id', async (c) => {
  const list = c.get('list')
  const user = c.get('user')
  const [todos, lists, members] = await Promise.all([
    todoProps(list.id, user.id, parseFilter(c.req.query('filter')), doneOpen(c)),
    listsForUser(user.id),
    membersOfList(list.id),
  ])
  return c.html(<Page user={user} list={list} lists={lists} members={members} todos={todos} />)
})

app.get('/list/:id/todos', async (c) => {
  const props = await todoProps(
    c.get('list').id,
    c.get('user').id,
    parseFilter(c.req.query('filter')),
    doneOpen(c),
  )

  if (c.req.header('X-Todo-Version') === props.version) return c.body(null, 204)
  return c.html(<TodoList {...props} />)
})

app.post('/list/:id/todos', async (c) => {
  const body = await c.req.parseBody()
  const title = field(body, 'title')

  if (title) {
    const list = c.get('list')
    const notes = field(body, 'notes')
    const dueDate = field(body, 'due_date')
    const assigneeId = field(body, 'assignee_id')
    const members = await membersOfList(list.id)

    await createTodo(list.id, c.get('user').id, {
      title: title.slice(0, 500),
      notes: notes ? notes.slice(0, 2000) : null,
      assigneeId: members.some((m) => m.id === assigneeId) ? assigneeId : null,
      dueDate: dueDate && isValidDate(dueDate) ? dueDate : null,
      important: body['important'] !== undefined,
    })
  }

  return c.html(await renderList(c))
})

app.post('/list/:id/todos/:todoId/toggle', async (c) => {
  await toggleTodo(c.get('list').id, c.req.param('todoId'), c.get('user').id)
  return c.html(await renderList(c))
})

app.post('/list/:id/todos/:todoId/delete', async (c) => {
  await deleteTodo(c.get('list').id, c.req.param('todoId'))
  return c.html(await renderList(c))
})

app.get('/list/:id/todos/:todoId/edit', async (c) => {
  const list = c.get('list')
  const todo = await findTodo(list.id, c.req.param('todoId'))
  if (!todo) return c.notFound()

  return c.html(
    <TodoEditRow
      todo={todo}
      listId={list.id}
      filter={parseFilter(c.req.query('filter'))}
      members={await membersOfList(list.id)}
    />,
  )
})

app.post('/list/:id/todos/:todoId', async (c) => {
  const list = c.get('list')
  const todoId = c.req.param('todoId')
  const filter = parseFilter(c.req.query('filter'))

  const todo = await findTodo(list.id, todoId)
  if (!todo) return c.notFound()

  const body = await c.req.parseBody()
  const title = field(body, 'title')
  const notes = field(body, 'notes')
  const dueDate = field(body, 'due_date')
  const assigneeId = field(body, 'assignee_id')
  const important = body['important'] !== undefined

  const members = await membersOfList(list.id)
  const problem = !title
    ? 'A todo needs a title.'
    : dueDate && !isValidDate(dueDate)
      ? "That date doesn't look right."
      : assigneeId && !members.some((m) => m.id === assigneeId)
        ? 'That person is not on this list.'
        : null

  if (problem) {
    return c.html(
      <TodoEditRow
        todo={todo}
        listId={list.id}
        filter={filter}
        members={members}
        error={problem}
      />,
    )
  }

  await updateTodo(list.id, todoId, {
    title: title.slice(0, 500),
    notes: notes ? notes.slice(0, 2000) : null,
    assigneeId: assigneeId || null,
    dueDate: dueDate || null,
    important,
  })

  const saved = await findTodo(list.id, todoId)
  if (!saved) return c.notFound()

  return c.html(<TodoRow todo={saved} listId={list.id} filter={filter} today={londonToday()} />)
})

app.post('/list/:id/todos/:todoId/field', async (c) => {
  const list = c.get('list')
  const todoId = c.req.param('todoId')

  const todo = await findTodo(list.id, todoId)
  if (!todo) return c.notFound()

  const body = await c.req.parseBody()
  const title = field(body, 'title')
  if (!title) return c.body(null, 422)

  const notes = field(body, 'notes')
  const dueDate = field(body, 'due_date')
  const assigneeId = field(body, 'assignee_id')
  const members = await membersOfList(list.id)

  await updateTodo(list.id, todoId, {
    title: title.slice(0, 500),
    notes: notes ? notes.slice(0, 2000) : null,
    assigneeId: members.some((m) => m.id === assigneeId) ? assigneeId : null,
    dueDate: dueDate && isValidDate(dueDate) ? dueDate : null,
    important: body['important'] !== undefined,
  })

  return c.body(null, 204)
})

app.post('/list/:id/invite', async (c) => {
  const { token, hash } = generateToken()
  await createInvite(c.get('list').id, c.get('user').id, hash)
  return c.html(<InviteLink url={new URL(`/invite/${token}`, baseUrl(c)).toString()} />)
})

app.onError((err, c) => {
  console.error(err)
  return c.text(`Server error: ${err instanceof Error ? err.message : String(err)}`, 500)
})

export default app
