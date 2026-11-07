import { type NextRequest, NextResponse } from 'next/server'

import { getSessionSecret, readSessionToken, SESSION_COOKIE } from '@/lib/auth/session.ts'

/** Sends signed-out visitors of the vault screens to the login page. */
export function proxy(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value, getSessionSecret())
  if (session) return NextResponse.next()

  const login = new URL('/login', request.url)
  login.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/import/:path*', '/dashboard/:path*', '/consent/:path*', '/verify/:path*'],
}
