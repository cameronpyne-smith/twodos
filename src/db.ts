import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let cached: NeonQueryFunction<false, false> | null = null

function sql() {
  if (!cached) {
    const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('Neither DATABASE_URL_POOLED nor DATABASE_URL is set')
    }
    cached = neon(connectionString)
  }
  return cached
}

export type Todo = {
  id: string
  title: string
  completed_at: string | null
  created_at: string
}

export async function listTodos(): Promise<{ open: Todo[]; done: Todo[] }> {
  const rows = (await sql()`
    select id, title, completed_at, created_at
    from todos
    where deleted_at is null
      and (completed_at is null or completed_at > now() - interval '24 hours')
    order by completed_at nulls first, created_at desc
  `) as Todo[]

  return {
    open: rows.filter((t) => t.completed_at === null),
    done: rows.filter((t) => t.completed_at !== null),
  }
}

export async function createTodo(title: string): Promise<void> {
  await sql()`insert into todos (title) values (${title})`
}

export async function toggleTodo(id: string): Promise<void> {
  await sql()`
    update todos
    set completed_at = case when completed_at is null then now() else null end
    where id = ${id} and deleted_at is null
  `
}

export async function deleteTodo(id: string): Promise<void> {
  await sql()`update todos set deleted_at = now() where id = ${id}`
}
