import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let cached: NeonQueryFunction<false, false> | null = null

export function sql() {
  if (!cached) {
    const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('Neither DATABASE_URL_POOLED nor DATABASE_URL is set')
    }
    cached = neon(connectionString)
  }
  return cached
}
