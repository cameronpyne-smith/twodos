import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { findUserById, type User } from './users.js'

const COOKIE = 'session'
const SESSION_DAYS = 90
const MAX_LOGIN_ATTEMPTS = 10

export const LOGIN_ATTEMPT_LIMIT = MAX_LOGIN_ATTEMPTS

function secret(): string {
  const value = process.env.JWT_SECRET
  if (!value) throw new Error('JWT_SECRET is not set')
  return value
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function startSession(c: Context, userId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60
  const token = await sign({ sub: userId, exp }, secret(), 'HS256')

  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export function endSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' })
}

export async function currentUser(c: Context): Promise<User | null> {
  const token = getCookie(c, COOKIE)
  if (!token) return null

  try {
    const payload = await verify(token, secret(), 'HS256')
    if (typeof payload.sub !== 'string') return null
    return await findUserById(payload.sub)
  } catch {
    return null
  }
}

export const requireAuth: MiddlewareHandler<{ Variables: { user: User } }> = async (c, next) => {
  const user = await currentUser(c)
  if (!user) {
    if (c.req.header('HX-Request')) {
      c.header('HX-Redirect', '/login')
      return c.body(null, 204)
    }
    return c.redirect('/login')
  }
  c.set('user', user)
  await next()
}

export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? 'unknown'
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.'
  if (password.length > 200) return 'Password must be under 200 characters.'
  return null
}

export function emailProblem(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.'
  return null
}
