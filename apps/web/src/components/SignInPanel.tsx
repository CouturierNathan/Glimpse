'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { ErrorNotice } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { useSession } from './SessionProvider.tsx'

export function SignInPanel({ next }: { next: Route }) {
  const { status, error, signIn } = useSession()
  const { t } = useI18n()
  const router = useRouter()

  useEffect(() => {
    if (status === 'signed-in') router.replace(next)
  }, [status, next, router])

  const busy = status === 'loading' || status === 'signing-in' || status === 'signed-in'

  return (
    <div className="panel">
      <ol className="numbered">
        <li>
          <div>
            <strong>{t('signIn.step1.title')}</strong>
            <span>{t('signIn.step1.text')}</span>
          </div>
        </li>
        <li>
          <div>
            <strong>{t('signIn.step2.title')}</strong>
            <span>{t('signIn.step2.text')}</span>
          </div>
        </li>
      </ol>
      <button type="button" className="button wide" onClick={signIn} disabled={busy}>
        {status === 'signing-in' && <span className="spinner" aria-hidden="true" />}
        {status === 'signing-in' ? t('signIn.busy') : t('signIn.button')}
      </button>
      <ErrorNotice message={error} />
    </div>
  )
}
