import { type NextRequest, NextResponse } from 'next/server'

import { getSessionSecret, readSessionToken, SESSION_COOKIE } from '@/lib/auth/session.ts'

/**
 * Sends signed-out visitors of the holder and issuer screens to the login page. Creating a
 * request (/verify) and reading one (/consent) need no account: answering asks to sign in there.
 */
export function proxy(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value, getSessionSecret())
  if (session) return NextResponse.next()

  const login = new URL('/login', request.url)
  login.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/import/:path*', '/dashboard/:path*', '/issuer/:path*'],
}
