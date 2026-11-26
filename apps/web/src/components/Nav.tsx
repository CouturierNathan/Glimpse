'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { isActive, navItems } from '@/lib/nav.ts'

import { useI18n } from './I18nProvider.tsx'

export function Nav() {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <nav aria-label={t('nav.label')} className="nav-wrap">
      <ul className="nav">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              {t(item.label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
