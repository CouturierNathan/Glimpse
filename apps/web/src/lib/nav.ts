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
