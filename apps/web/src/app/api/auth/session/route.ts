import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth/server.ts'

/** Tells the client who is signed in, if anyone. */
export async function GET() {
  const session = await getSession()
  return NextResponse.json(
    { address: session?.address ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
