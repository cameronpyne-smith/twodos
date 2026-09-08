import { nextColour } from './colours.js'
import { sql } from './sql.js'
import { updateColour, type User } from './users.js'

export type List = {
  id: string
  name: string
}

const INVITE_DAYS = 7

export async function listsForUser(userId: string): Promise<List[]> {
  return (await sql()`
    select l.id, l.name
    from lists l
    join memberships m on m.list_id = l.id
    where m.user_id = ${userId}
    order by m.joined_at
  `) as List[]
}

export async function findListForUser(listId: string, userId: string): Promise<List | null> {
  const rows = (await sql()`
    select l.id, l.name
    from lists l
    join memberships m on m.list_id = l.id
    where l.id = ${listId} and m.user_id = ${userId}
  `) as List[]
  return rows[0] ?? null
}

export async function findList(listId: string): Promise<List | null> {
  const rows = (await sql()`select id, name from lists where id = ${listId}`) as List[]
  return rows[0] ?? null
}

export async function createList(name: string, userId: string): Promise<List> {
  const rows = (await sql()`
    insert into lists (name, created_by) values (${name}, ${userId})
    returning id, name
  `) as List[]
  const list = rows[0]
  if (!list) throw new Error('Insert returned no list')

  await sql()`insert into memberships (user_id, list_id) values (${userId}, ${list.id})`
  return list
}

export async function membersOfList(listId: string): Promise<User[]> {
  return (await sql()`
    select u.id, u.email, u.display_name, u.colour
    from users u
    join memberships m on m.user_id = u.id
    where m.list_id = ${listId}
    order by m.joined_at
  `) as User[]
}

export async function isMember(listId: string, userId: string): Promise<boolean> {
  const rows = (await sql()`
    select 1 as ok from memberships where list_id = ${listId} and user_id = ${userId}
  `) as { ok: number }[]
  return rows.length > 0
}

export async function createInvite(
  listId: string,
  userId: string,
  tokenHash: string,
): Promise<void> {
  await sql()`
    insert into invites (list_id, created_by, token_hash, expires_at)
    values (${listId}, ${userId}, ${tokenHash}, now() + ${`${INVITE_DAYS} days`}::interval)
  `
}

export async function peekInvite(tokenHash: string): Promise<string | null> {
  const rows = (await sql()`
    select list_id from invites
    where token_hash = ${tokenHash} and used_at is null and expires_at > now()
  `) as { list_id: string }[]
  return rows[0]?.list_id ?? null
}

export async function acceptInvite(tokenHash: string, userId: string): Promise<string | null> {
  const rows = (await sql()`
    update invites
    set used_at = now(), used_by = ${userId}
    where token_hash = ${tokenHash} and used_at is null and expires_at > now()
    returning list_id
  `) as { list_id: string }[]

  const listId = rows[0]?.list_id
  if (!listId) return null

  await sql()`
    insert into memberships (user_id, list_id) values (${userId}, ${listId})
    on conflict do nothing
  `
  await settleColour(listId, userId)
  return listId
}

async function settleColour(listId: string, userId: string): Promise<void> {
  const members = await membersOfList(listId)
  const mine = members.find((m) => m.id === userId)
  if (!mine) return

  const taken = members.filter((m) => m.id !== userId).map((m) => m.colour)
  if (!taken.includes(mine.colour)) return

  await updateColour(userId, nextColour(taken))
}
