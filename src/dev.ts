import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const { serve } = await import('@hono/node-server')
const { serveStatic } = await import('@hono/node-server/serve-static')
const { Hono } = await import('hono')
const app = (await import('./app')).default

const root = new Hono()
root.use('/*', serveStatic({ root: './public' }))
root.route('/', app)

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: root.fetch, port })
console.log(`twodos dev server on http://localhost:${port}`)
