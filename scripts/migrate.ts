import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from 'dotenv'
import pg from 'pg'

const production = process.argv.includes('--prod')
const envFile = production ? '.env.production.local' : '.env.local'

if (!existsSync(envFile)) {
  console.error(`${envFile} does not exist.`)
  process.exit(1)
}

config({ path: envFile, quiet: true })

const MIGRATIONS_DIR = join(process.cwd(), 'migrations')

const connectionString = process.env.DATABASE_URL ?? process.env.DATABASE_URL_POOLED
if (!connectionString) {
  console.error(`DATABASE_URL is not set in ${envFile}.`)
  process.exit(1)
}

const target = new URL(connectionString)
console.log(`Target: ${target.hostname}${target.pathname}${production ? '  [PRODUCTION]' : ''}`)

const client = new pg.Client({ connectionString })
await client.connect()

await client.query(`
  create table if not exists _migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`)

const applied = new Set(
  (await client.query<{ name: string }>('select name from _migrations')).rows.map((r) => r.name),
)

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
const pending = files.filter((f) => !applied.has(f))

if (pending.length === 0) {
  console.log(`Up to date (${files.length} applied).`)
} else {
  for (const file of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into _migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log(`Applied ${file}`)
    } catch (err) {
      await client.query('rollback')
      console.error(`Failed ${file}:`, err instanceof Error ? err.message : err)
      await client.end()
      process.exit(1)
    }
  }
}

await client.end()
