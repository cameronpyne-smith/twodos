import { sql } from './sql.js'

export type Todo = {
  id: string
  title: string
  completed_at: string | null
  created_at: string
}

export async function listTodos(listId: string): Promise<{ open: Todo[]; done: Todo[] }> {
  const rows = (await sql()`
    select id, title, completed_at, created_at
    from todos
    where list_id = ${listId}
      and deleted_at is null
      and (completed_at is null or completed_at > now() - interval '24 hours')
    order by completed_at nulls first, created_at desc
  `) as Todo[]

  return {
    open: rows.filter((t) => t.completed_at === null),
    done: rows.filter((t) => t.completed_at !== null),
  }
}

export async function createTodo(listId: string, title: string): Promise<void> {
  await sql()`insert into todos (list_id, title) values (${listId}, ${title})`
}

export async function toggleTodo(listId: string, id: string): Promise<void> {
  await sql()`
    update todos
    set completed_at = case when completed_at is null then now() else null end
    where id = ${id} and list_id = ${listId} and deleted_at is null
  `
}

export async function deleteTodo(listId: string, id: string): Promise<void> {
  await sql()`update todos set deleted_at = now() where id = ${id} and list_id = ${listId}`
}
