import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'

import { appChain } from '@/lib/chains.ts'
import { nonces, secureCookie } from '@/lib/auth/server.ts'
import {
  createSessionToken,
  getSessionSecret,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from '@/lib/auth/session.ts'
import { NONCE_COOKIE, parseSignInBody, verifySignIn } from '@/lib/auth/siwe.ts'

const client = createPublicClient({ chain: appChain, transport: http() })

/** Checks a signed SIWE message and opens a session for its signer. */
export async function POST(request: NextRequest) {
  const jar = await cookies()
  const nonce = jar.get(NONCE_COOKIE)?.value
  // A nonce must come from this browser and is spent on the first attempt, whatever its outcome,
  // so a captured signature cannot be replayed.
  const fresh = nonce !== undefined && nonces.consume(nonce)
  jar.delete(NONCE_COOKIE)

  const body = parseSignInBody(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'Malformed sign-in request' }, { status: 400 })
  if (!nonce || !fresh) {
    return NextResponse.json({ error: 'Sign-in expired, try again' }, { status: 401 })
  }

  const address = await verifySignIn(client, body, {
    domain: request.nextUrl.host,
    origin: request.nextUrl.origin,
    nonce,
    chainId: appChain.id,
  })
  if (!address) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  const issuedAt = Date.now()
  const expiresAt = issuedAt + SESSION_TTL_MS
  const token = createSessionToken(
    {
      schemaVersion: '1.0.0',
      address,
      chainId: appChain.id,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    },
    getSessionSecret(),
  )
  jar.set(SESSION_COOKIE, token, { ...secureCookie, expires: expiresAt })
  return NextResponse.json({ address })
}
