import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth/server.ts'
import { identityReports } from '@/lib/identity/server.ts'
import { noStore, signedOut } from '@/lib/vault/http.ts'
import { holders } from '@/lib/vault/server.ts'

/** Whether the signed-in holder's identity is verified. Says nothing about whose it is. */
export async function GET() {
  const session = await getSession()
  if (!session) return signedOut()
  const holder = holders.find(session.address, session.chainId)
  const verified = holder ? identityReports.verified(holder.holderId) !== null : false
  return NextResponse.json({ verified }, { headers: noStore })
}
