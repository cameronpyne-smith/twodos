import { createHash } from 'node:crypto'
import { londonToday } from './dates.js'
import { sql } from './sql.js'

export type Todo = {
  id: string
  title: string
  notes: string | null
  important: boolean
  assignee_id: string | null
  assignee_name: string | null
  assignee_colour: string | null
  due_date: string | null
  completed_at: string | null
  created_at: string
}

export type TodoFields = {
  title: string
  notes: string | null
  assigneeId: string | null
  dueDate: string | null
  important: boolean
}

export const FILTERS = ['all', 'mine', 'theirs', 'unassigned'] as const

export type Filter = (typeof FILTERS)[number]

export function parseFilter(value: string | undefined): Filter {
  return FILTERS.includes(value as Filter) ? (value as Filter) : 'all'
}

export function isOverdue(todo: Todo, today: string = londonToday()): boolean {
  return todo.completed_at === null && todo.due_date !== null && todo.due_date < today
}

export function applyFilter(todos: Todo[], filter: Filter, userId: string): Todo[] {
  switch (filter) {
    case 'mine':
      return todos.filter((t) => t.assignee_id === userId)
    case 'theirs':
      return todos.filter((t) => t.assignee_id !== null && t.assignee_id !== userId)
    case 'unassigned':
      return todos.filter((t) => t.assignee_id === null)
    default:
      return todos
  }
}

export function todoVersion(todos: Todo[], filter: Filter, today: string): string {
  const rows = todos.map((t) => [
    t.id,
    t.title,
    t.notes,
    t.important,
    t.assignee_id,
    t.assignee_name,
    t.assignee_colour,
    t.due_date,
    t.completed_at,
  ])

  return createHash('sha256')
    .update(JSON.stringify([rows, filter, today]))
    .digest('base64url')
    .slice(0, 22)
}

export function splitTodos(todos: Todo[]): { open: Todo[]; done: Todo[] } {
  return {
    open: todos.filter((t) => t.completed_at === null),
    done: todos.filter((t) => t.completed_at !== null),
  }
}

export async function listTodos(listId: string): Promise<Todo[]> {
  return (await sql()`
    select t.id, t.title, t.notes, t.important, t.assignee_id,
           u.display_name as assignee_name, u.colour as assignee_colour,
           to_char(t.due_date, 'YYYY-MM-DD') as due_date,
           to_char(t.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as completed_at,
           to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from todos t
    left join memberships m on m.user_id = t.assignee_id and m.list_id = t.list_id
    left join users u on u.id = m.user_id
    where t.list_id = ${listId}
      and t.deleted_at is null
      and (t.completed_at is null or t.completed_at > now() - interval '24 hours')
    order by (t.completed_at is not null),
             t.completed_at desc,
             t.important desc,
             t.due_date asc nulls last,
             t.created_at desc,
             t.id
  `) as Todo[]
}

export async function findTodo(listId: string, id: string): Promise<Todo | null> {
  const rows = (await sql()`
    select t.id, t.title, t.notes, t.important, t.assignee_id,
           u.display_name as assignee_name, u.colour as assignee_colour,
           to_char(t.due_date, 'YYYY-MM-DD') as due_date,
           to_char(t.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as completed_at,
           to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from todos t
    left join memberships m on m.user_id = t.assignee_id and m.list_id = t.list_id
    left join users u on u.id = m.user_id
    where t.id = ${id} and t.list_id = ${listId} and t.deleted_at is null
  `) as Todo[]
  return rows[0] ?? null
}

export async function createTodo(
  listId: string,
  createdBy: string,
  fields: TodoFields,
): Promise<void> {
  await sql()`
    insert into todos (list_id, created_by, title, notes, assignee_id, due_date, important)
    values (${listId}, ${createdBy}, ${fields.title}, ${fields.notes},
            ${fields.assigneeId}::uuid, ${fields.dueDate}::date, ${fields.important})
  `
}

export async function updateTodo(listId: string, id: string, fields: TodoFields): Promise<void> {
  await sql()`
    update todos
    set title       = ${fields.title},
        notes       = ${fields.notes},
        assignee_id = ${fields.assigneeId}::uuid,
        due_date    = ${fields.dueDate}::date,
        important   = ${fields.important}
    where id = ${id} and list_id = ${listId} and deleted_at is null
  `
}

export async function toggleTodo(listId: string, id: string, userId: string): Promise<void> {
  await sql()`
    update todos
    set completed_at = case when completed_at is null then now() else null end,
        completed_by = case when completed_at is null then ${userId}::uuid else null end
    where id = ${id} and list_id = ${listId} and deleted_at is null
  `
}

export async function deleteTodo(listId: string, id: string): Promise<void> {
  await sql()`update todos set deleted_at = now() where id = ${id} and list_id = ${listId}`
}
