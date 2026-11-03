import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { nonces, secureCookie } from '@/lib/auth/server.ts'
import { NONCE_COOKIE, SIWE_MESSAGE_TTL_MS } from '@/lib/auth/siwe.ts'

/** Issues a one-time nonce for the next SIWE message. */
export async function GET() {
  const nonce = nonces.issue()
  const jar = await cookies()
  jar.set(NONCE_COOKIE, nonce, { ...secureCookie, maxAge: SIWE_MESSAGE_TTL_MS / 1000 })
  return NextResponse.json({ nonce }, { headers: { 'Cache-Control': 'no-store' } })
}
