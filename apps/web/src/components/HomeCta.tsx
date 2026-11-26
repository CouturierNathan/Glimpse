'use client'

import Link from 'next/link'

import { useI18n } from './I18nProvider.tsx'
import { useSession } from './SessionProvider.tsx'

/** Sign in, or straight to the vault for someone already signed in. */
export function HomeCta() {
  const { status } = useSession()
  const { t } = useI18n()
  const signedIn = status === 'signed-in'

  return (
    <Link href={signedIn ? '/dashboard' : '/login'} className="button hero-cta">
      {signedIn ? t('home.ctaSignedIn') : t('home.cta')}
      <svg viewBox="0 0 16 16" aria-hidden="true" className="arrow">
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </Link>
  )
}
