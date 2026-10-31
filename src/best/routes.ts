import { createHash } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { baseUrl } from '../auth.js'
import { COMMANDS, QUERIES, Refused } from './definitions.js'
import {
  COMMAND_RATE_LIMIT,
  commandsThisMinute,
  correlationOwner,
  findAcceptedCommand,
  isDuplicateKey,
  recordCommand,
  resolveApiKey,
  setCommandStatus,
  type Agent,
} from './keys.js'
import { endpoint, manifest } from './manifest.js'
import { jsonSchema, validate } from './schema.js'

type BestEnv = { Variables: { agent: Agent } }

const MAX_BODY = 64 * 1024

const TAKES = ['application/json', 'application/cloudevents+json']

const JSON_SCHEMA_KEYWORD = 'https://json-schema.org/draft/2020-12/schema'

function problem(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): { error: { code: string; message: string; details: Record<string, unknown> } } {
  return { error: { code, message, details } }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
}

function base(c: Context): string {
  return endpoint(baseUrl(c))
}

export function wellKnown(c: Context): Response {
  return c.json(manifest(baseUrl(c)))
}

export const bestCors = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Api-Key'],
  exposeHeaders: ['Retry-After'],
  maxAge: 86400,
})

export const best = new Hono<BestEnv>()

best.use('*', bestCors)

best.use('*', async (c, next) => {
  const token = c.req.header('X-Api-Key')
  if (!token) {
    return c.json(
      problem('UNAUTHORIZED', 'This endpoint needs an API key, created from your twodos profile.'),
      401,
    )
  }

  const agent = await resolveApiKey(token)
  if (!agent) return c.json(problem('UNAUTHORIZED', 'That API key is not valid.'), 401)

  c.set('agent', agent)
  await next()
})

best.get('/commands', (c) =>
  c.json({
    commands: COMMANDS.map((command) => ({
      schema: command.schema,
      version: command.version,
      commandType: command.commandType,
      dataschema: `${base(c)}commands/${command.schema}/${command.version}`,
      description: command.description,
      ...(command.impact ? { impact: command.impact } : {}),
    })),
  }),
)

best.get('/commands/:schema/:version', (c) => {
  const command = COMMANDS.find((x) => x.schema === c.req.param('schema'))
  if (!command) {
    return c.json(
      problem('SCHEMA_NOT_FOUND', `No command schema named '${c.req.param('schema')}'.`),
      404,
    )
  }
  if (command.version !== c.req.param('version')) {
    return c.json(
      problem('VERSION_NOT_FOUND', `That command schema has no version '${c.req.param('version')}'.`, {
        available: [command.version],
      }),
      404,
    )
  }

  const document = {
    $schema: JSON_SCHEMA_KEYWORD,
    $id: `${base(c)}commands/${command.schema}/${command.version}`,
    title: command.commandType,
    description: command.description,
    commandType: command.commandType,
    ...(command.impact ? { impact: command.impact } : {}),
    ...jsonSchema(command.shape, command.required),
  }

  return c.body(JSON.stringify(document), 200, { 'content-type': 'application/schema+json' })
})

best.post('/commands', async (c) => {
  const agent = c.get('agent')

  const media = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  if (!media || !TAKES.includes(media)) {
    return c.json(
      problem(
        'UNSUPPORTED_MEDIA_TYPE',
        `A command is taken as ${TAKES.join(' or ')}.`,
        { takes: TAKES },
      ),
      415,
    )
  }

  const raw = await c.req.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) {
    return c.json(
      problem('BODY_TOO_LARGE', `A command may be at most ${MAX_BODY} bytes.`, { limit: MAX_BODY }),
      413,
    )
  }

  if ((await commandsThisMinute(agent.keyId)) >= COMMAND_RATE_LIMIT) {
    c.header('Retry-After', '60')
    return c.json(
      problem(
        'TOO_MANY_COMMANDS',
        `This key may send ${COMMAND_RATE_LIMIT} commands a minute.`,
        { limit: COMMAND_RATE_LIMIT },
      ),
      429,
    )
  }

  let envelope: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return c.json(problem('ENVELOPE_INVALID', 'The body must be a JSON object.'), 400)
    }
    envelope = parsed as Record<string, unknown>
  } catch {
    return c.json(problem('ENVELOPE_INVALID', 'The body is not JSON.'), 400)
  }

  const required = ['specversion', 'id', 'source', 'type'] as const
  for (const field of required) {
    const value = envelope[field]
    if (typeof value !== 'string' || value.length === 0) {
      return c.json(
        problem('ENVELOPE_INVALID', `${field} is required and must be a non-empty string.`, {
          field,
        }),
        400,
      )
    }
  }

  if (envelope.specversion !== '1.0') {
    return c.json(
      problem('ENVELOPE_INVALID', 'Only CloudEvents specversion 1.0 is taken.', {
        field: 'specversion',
      }),
      400,
    )
  }

  const id = envelope.id as string
  const command = COMMANDS.find((x) => x.commandType === envelope.type)
  if (!command) {
    return c.json(
      problem('UNKNOWN_COMMAND_TYPE', `This service takes no command of type '${envelope.type}'.`, {
        field: 'type',
        type: envelope.type,
      }),
      400,
    )
  }

  const stated = envelope.correlationid
  const correlationId = typeof stated === 'string' && stated.length > 0 ? stated : id

  const owner = await correlationOwner(correlationId)
  if (owner && owner !== agent.keyId) {
    return c.json(
      problem(
        'CORRELATION_NOT_YOURS',
        'That correlation identifier belongs to another sender.',
        { field: 'correlationid', correlationid: correlationId },
      ),
      400,
    )
  }

  const data = (envelope.data ?? {}) as Record<string, unknown>
  const payloadHash = createHash('sha256')
    .update(stable({ type: envelope.type, data }))
    .digest('hex')

  let entry: string
  try {
    entry = await recordCommand(agent.keyId, id, payloadHash, correlationId)
  } catch (error) {
    if (!isDuplicateKey(error)) throw error

    const prior = await findAcceptedCommand(agent.keyId, id)
    if (!prior) throw error

    if (prior.payload_hash !== payloadHash) {
      return c.json(
        problem('DUPLICATE_COMMAND_ID', 'That command id was already used for a different command.', {
          field: 'id',
          id,
        }),
        409,
      )
    }

    return c.json({ id, correlationId: prior.correlation_id }, 201)
  }

  const problems = validate(command.shape, command.required, data)
  if (problems.length > 0) {
    await setCommandStatus(entry, 400)
    return c.json(
      problem('DATA_INVALID', 'The command data does not match its schema.', { problems }),
      400,
    )
  }

  try {
    await command.run({ ...agent, correlationId }, data)
  } catch (error) {
    if (error instanceof Refused) {
      await setCommandStatus(entry, 400)
      return c.json(problem(error.code, error.message, error.details), 400)
    }

    await setCommandStatus(entry, 500)
    throw error
  }

  return c.json({ id, correlationId }, 201)
})

best.get('/queries', (c) =>
  c.json({
    queries: QUERIES.map((query) => ({
      schema: query.schema,
      version: query.version,
      dataschema: `${base(c)}queries/${query.schema}/${query.version}`,
      description: query.description,
    })),
  }),
)

best.get('/queries/:schema/:version', (c) => {
  const query = QUERIES.find((x) => x.schema === c.req.param('schema'))
  if (!query) {
    return c.json(
      problem('SCHEMA_NOT_FOUND', `No query schema named '${c.req.param('schema')}'.`),
      404,
    )
  }
  if (query.version !== c.req.param('version')) {
    return c.json(
      problem('VERSION_NOT_FOUND', `That query schema has no version '${c.req.param('version')}'.`, {
        available: [query.version],
      }),
      404,
    )
  }

  const takesParameters = Object.keys(query.shape).length > 0

  const document = {
    $schema: JSON_SCHEMA_KEYWORD,
    $id: `${base(c)}queries/${query.schema}/${query.version}`,
    description: query.description,
    ...(takesParameters ? { parameters: jsonSchema(query.shape, query.required) } : {}),
    response: query.response,
  }

  return c.body(JSON.stringify(document), 200, { 'content-type': 'application/schema+json' })
})

best.get('/queries/:schema', async (c) => {
  const query = QUERIES.find((x) => x.schema === c.req.param('schema'))
  if (!query) {
    return c.json(
      problem('SCHEMA_NOT_FOUND', `No query schema named '${c.req.param('schema')}'.`),
      404,
    )
  }

  const params = c.req.query()
  const problems = validate(query.shape, query.required, params)
  if (problems.length > 0) {
    return c.json(
      problem('PARAMETERS_INVALID', 'The query parameters do not match its schema.', { problems }),
      400,
    )
  }

  try {
    return c.json(await query.run(c.get('agent'), params))
  } catch (error) {
    if (error instanceof Refused) {
      return c.json(problem(error.code, error.message, error.details), 400)
    }
    throw error
  }
})
