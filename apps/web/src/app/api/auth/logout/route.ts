import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { SESSION_COOKIE } from '@/lib/auth/session.ts'

export async function POST() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  return new NextResponse(null, { status: 204 })
}
