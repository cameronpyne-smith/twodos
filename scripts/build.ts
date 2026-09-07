import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'esbuild'

const OUT = join(process.cwd(), '.vercel', 'output')
const FUNC = join(OUT, 'functions', 'api', 'index.func')

await rm(OUT, { recursive: true, force: true })
await mkdir(FUNC, { recursive: true })

await build({
  entryPoints: ['src/vercel.ts'],
  outfile: join(FUNC, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  jsx: 'automatic',
  jsxImportSource: 'hono/jsx',
  minify: true,
  logLevel: 'info',
})

await writeFile(join(FUNC, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))

await writeFile(
  join(FUNC, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
    },
    null,
    2,
  ),
)

await cp(join(process.cwd(), 'public'), join(OUT, 'static'), { recursive: true })

await writeFile(
  join(OUT, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/api' }],
    },
    null,
    2,
  ),
)

console.log('Build output written to .vercel/output')
