import type { Route } from 'next'

export interface NavItem {
  href: '/import' | '/dashboard' | '/consent' | '/verify' | '/issuer'
  label: string
}

export const navItems: readonly NavItem[] = [
  { href: '/dashboard', label: 'Vault' },
  { href: '/import', label: 'Import' },
  { href: '/consent', label: 'Requests' },
  { href: '/verify', label: 'Verify' },
  { href: '/issuer', label: 'Issue' },
]

/** A nav item stays active on its own sub-pages, e.g. `/import/review`. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Where to send the user after sign-in. Only app routes are allowed, to rule out open redirects:
 * the nav pages, and a request link (`/consent/<request id>`) so a holder lands back on it.
 */
export function safeNextPath(next: unknown): Route {
  if (typeof next === 'string' && /^\/consent\/[0-9a-f]{32}$/.test(next)) return next as Route
  return navItems.find((item) => item.href === next)?.href ?? '/dashboard'
}
