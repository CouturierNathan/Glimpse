'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { shortAddress } from '@/lib/format.ts'

import { useI18n } from './I18nProvider.tsx'
import { useSession } from './SessionProvider.tsx'

export function AccountButton() {
  const { status, address, signOut } = useSession()
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()

  if (status === 'loading') return <span className="account" aria-busy="true" />
  if (status !== 'signed-in' || !address) {
    // The sign-in page already holds the sign-in button; a second one in the header leads nowhere.
    if (pathname === '/login') return <span className="account" />

    return (
      <span className="account">
        <Link href="/login" className="button small">
          {t('account.signIn')}
        </Link>
      </span>
    )
  }

  return (
    <span className="account">
      <span className="address" title={t('account.address', { address })}>
        <span className="dot" aria-hidden="true" />
        {shortAddress(address)}
      </span>
      <button
        type="button"
        className="button quiet small"
        onClick={async () => {
          await signOut()
          router.push('/')
        }}
      >
        {t('account.signOut')}
      </button>
    </span>
  )
}
