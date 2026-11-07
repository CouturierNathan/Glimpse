import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth/server.ts'
import { noStore, signedOut } from '@/lib/vault/http.ts'
import { holders } from '@/lib/vault/server.ts'

/** The signed-in wallet's opaque holder id, which the browser binds its encryption keys to. */
export async function GET() {
  const session = await getSession()
  if (!session) return signedOut()
  const holderId = holders.ensure(session.address, session.chainId)
  return NextResponse.json({ holderId }, { headers: noStore })
}
