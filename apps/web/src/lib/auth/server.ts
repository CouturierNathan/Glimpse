import { cookies } from 'next/headers'

import { NonceStore } from './nonces.ts'
import { getSessionSecret, readSessionToken, SESSION_COOKIE, type Session } from './session.ts'
import { SIWE_MESSAGE_TTL_MS } from './siwe.ts'

/** Session of the current request, for route handlers and server components. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  return readSessionToken(jar.get(SESSION_COOKIE)?.value, getSessionSecret())
}

/** Cookie options shared by the nonce and session cookies. */
export const secureCookie = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const

// Kept on globalThis so every route handler, and dev hot reloads, share one store.
const globalForNonces = globalThis as { glimpseNonces?: NonceStore }
export const nonces = (globalForNonces.glimpseNonces ??= new NonceStore(SIWE_MESSAGE_TTL_MS))
