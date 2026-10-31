import { generateToken, hashToken } from '../auth.js'
import { sql } from '../sql.js'

export type Agent = { userId: string; keyId: string }

export type ApiKey = {
  id: string
  name: string
  last_used_at: string | null
  created_at: string
}

export type LedgerEntry = {
  payload_hash: string | null
  correlation_id: string | null
  status: number
}

export const COMMAND_RATE_LIMIT = 60
export const LEDGER_RETENTION_DAYS = 30
export const MAX_KEYS_PER_USER = 10

export async function createApiKey(
  userId: string,
  name: string,
): Promise<{ id: string; token: string }> {
  const { token, hash } = generateToken()

  const rows = (await sql()`
    insert into api_keys (user_id, name, token_hash)
    values (${userId}, ${name}, ${hash})
    returning id
  `) as { id: string }[]

  const id = rows[0]?.id
  if (!id) throw new Error('Insert returned no api key')
  return { id, token }
}

export async function keysForUser(userId: string): Promise<ApiKey[]> {
  return (await sql()`
    select id, name,
           to_char(last_used_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_used_at,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from api_keys
    where user_id = ${userId} and revoked_at is null
    order by created_at desc
  `) as ApiKey[]
}

export async function countKeys(userId: string): Promise<number> {
  const rows = (await sql()`
    select count(*)::int as n from api_keys where user_id = ${userId} and revoked_at is null
  `) as { n: number }[]
  return rows[0]?.n ?? 0
}

export async function revokeApiKey(userId: string, keyId: string): Promise<void> {
  await sql()`
    update api_keys set revoked_at = now()
    where id = ${keyId} and user_id = ${userId} and revoked_at is null
  `
}

export async function resolveApiKey(token: string): Promise<Agent | null> {
  const rows = (await sql()`
    update api_keys set last_used_at = now()
    where token_hash = ${hashToken(token)}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    returning id, user_id
  `) as { id: string; user_id: string }[]

  const row = rows[0]
  return row ? { keyId: row.id, userId: row.user_id } : null
}

export async function findAcceptedCommand(
  keyId: string,
  commandId: string,
): Promise<LedgerEntry | null> {
  const rows = (await sql()`
    select payload_hash, correlation_id, status
    from best_commands
    where key_id = ${keyId} and id = ${commandId} and status = 201
  `) as LedgerEntry[]
  return rows[0] ?? null
}

export async function correlationOwner(correlationId: string): Promise<string | null> {
  const rows = (await sql()`
    select key_id from best_commands
    where correlation_id = ${correlationId} and status = 201
    limit 1
  `) as { key_id: string }[]
  return rows[0]?.key_id ?? null
}

export async function recordCommand(
  keyId: string,
  commandId: string,
  payloadHash: string,
  correlationId: string,
): Promise<string> {
  const rows = (await sql()`
    insert into best_commands (id, key_id, payload_hash, correlation_id, status)
    values (${commandId}, ${keyId}, ${payloadHash}, ${correlationId}, 201)
    returning entry
  `) as { entry: string }[]

  const entry = rows[0]?.entry
  if (!entry) throw new Error('Insert returned no ledger entry')
  return entry
}

export async function setCommandStatus(entry: string, status: number): Promise<void> {
  await sql()`update best_commands set status = ${status} where entry = ${entry}`
}

export function isDuplicateKey(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  return code === '23505' || String(error).includes('best_commands_idempotency_idx')
}

export async function commandsThisMinute(keyId: string): Promise<number> {
  const rows = (await sql()`
    select count(*)::int as n from best_commands
    where key_id = ${keyId} and created_at > now() - interval '1 minute'
  `) as { n: number }[]
  return rows[0]?.n ?? 0
}

export async function pruneLedger(): Promise<void> {
  await sql()`
    delete from best_commands
    where created_at < now() - ${`${LEDGER_RETENTION_DAYS} days`}::interval
  `
}
