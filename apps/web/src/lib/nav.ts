export interface NavItem {
  href: '/import' | '/dashboard' | '/consent'
  label: string
}

export const navItems: readonly NavItem[] = [
  { href: '/dashboard', label: 'Vault' },
  { href: '/import', label: 'Import' },
  { href: '/consent', label: 'Requests' },
]

/** A nav item stays active on its own sub-pages, e.g. `/import/review`. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Where to send the user after sign-in. Only app routes are allowed, to rule out open redirects. */
export function safeNextPath(next: unknown): NavItem['href'] {
  return navItems.find((item) => item.href === next)?.href ?? '/dashboard'
}
