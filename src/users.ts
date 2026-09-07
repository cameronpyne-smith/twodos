import { sql } from './sql.js'

export type User = {
  id: string
  email: string
  display_name: string
}

type UserWithHash = User & { password_hash: string }

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function findUserByEmail(email: string): Promise<UserWithHash | null> {
  const rows = (await sql()`
    select id, email, display_name, password_hash
    from users
    where email = ${normaliseEmail(email)}
  `) as UserWithHash[]
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = (await sql()`
    select id, email, display_name from users where id = ${id}
  `) as User[]
  return rows[0] ?? null
}

export async function createUser(
  email: string,
  passwordHash: string,
  displayName: string,
): Promise<User> {
  const rows = (await sql()`
    insert into users (email, password_hash, display_name)
    values (${normaliseEmail(email)}, ${passwordHash}, ${displayName})
    returning id, email, display_name
  `) as User[]
  const user = rows[0]
  if (!user) throw new Error('Insert returned no user')
  return user
}

export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await sql()`update users set password_hash = ${passwordHash} where id = ${userId}`
}

export async function recordLoginAttempt(email: string, ip: string): Promise<void> {
  await sql()`insert into login_attempts (email, ip) values (${normaliseEmail(email)}, ${ip})`
}

export async function countRecentLoginAttempts(email: string, ip: string): Promise<number> {
  const rows = (await sql()`
    select count(*)::int as n
    from login_attempts
    where attempted_at > now() - interval '15 minutes'
      and (email = ${normaliseEmail(email)} or ip = ${ip})
  `) as { n: number }[]
  return rows[0]?.n ?? 0
}

export async function pruneLoginAttempts(): Promise<void> {
  await sql()`delete from login_attempts where attempted_at < now() - interval '1 day'`
}

export async function createPasswordReset(userId: string, tokenHash: string): Promise<void> {
  await sql()`
    insert into password_resets (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash}, now() + interval '1 hour')
  `
}

export async function consumePasswordReset(tokenHash: string): Promise<string | null> {
  const rows = (await sql()`
    update password_resets
    set used_at = now()
    where token_hash = ${tokenHash}
      and used_at is null
      and expires_at > now()
    returning user_id
  `) as { user_id: string }[]
  return rows[0]?.user_id ?? null
}

export async function invalidateUserResets(userId: string): Promise<void> {
  await sql()`
    update password_resets set used_at = now()
    where user_id = ${userId} and used_at is null
  `
}
