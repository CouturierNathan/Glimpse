import { createHmac, timingSafeEqual } from 'node:crypto'

import { type Address, getAddress, isAddress } from 'viem'

export const SESSION_COOKIE = 'glimpse_session'
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000

const MIN_SECRET_BYTES = 32

export interface Session {
  address: Address
  chainId: number
  /** Unix time in milliseconds. */
  expiresAt: number
}

/** Reads the HMAC key for session cookies. It lives in the environment, never in the repo. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || Buffer.byteLength(secret) < MIN_SECRET_BYTES) {
    throw new Error(
      `SESSION_SECRET must be set to at least ${MIN_SECRET_BYTES} bytes (see apps/web/.env.example)`,
    )
  }
  return secret
}

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}

/** Serialises a session as `<payload>.<hmac>`, both base64url. */
export function createSessionToken(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload, secret).toString('base64url')}`
}

/** Returns the session if the token is authentic and not expired, `null` otherwise. */
export function readSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Session | null {
  if (!token) return null
  const [payload, mac, extra] = token.split('.')
  if (!payload || !mac || extra !== undefined) return null

  const expected = sign(payload, secret)
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let data: unknown
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return null
  }
  if (!isSession(data) || data.expiresAt <= now) return null
  return { address: getAddress(data.address), chainId: data.chainId, expiresAt: data.expiresAt }
}

function isSession(data: unknown): data is Session {
  if (typeof data !== 'object' || data === null) return false
  const { address, chainId, expiresAt } = data as Record<string, unknown>
  return (
    typeof address === 'string' &&
    isAddress(address) &&
    Number.isSafeInteger(chainId) &&
    Number.isSafeInteger(expiresAt)
  )
}
