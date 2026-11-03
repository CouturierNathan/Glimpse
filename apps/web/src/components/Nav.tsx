'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { isActive, navItems } from '@/lib/nav.ts'

export function Nav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Main">
      <ul className="nav">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
