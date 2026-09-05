import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const htmxDist = dirname(require.resolve('htmx.org/package.json'))

await copyFile(join(htmxDist, 'dist/htmx.min.js'), join(process.cwd(), 'public/htmx.min.js'))
console.log('Vendored htmx.min.js into public/')
