'use client'

import { LockIcon } from './Icons.tsx'
import { useI18n } from './I18nProvider.tsx'
import { useIdentity } from './IdentityProvider.tsx'
import { IdentityPanel } from './IdentityPanel.tsx'
import { ImportPanel } from './ImportPanel.tsx'

/** Identity first, then documents: the document step stays locked until the identity is verified. */
export function ImportFlow() {
  const { t } = useI18n()
  const { status } = useIdentity()

  return (
    <div className="flow">
      <section className="flow-step" aria-labelledby="identity-title">
        <h2 id="identity-title" className="section-title">
          <span className="step-num" data-done={status === 'verified' ? '' : undefined}>
            1
          </span>
          {t('import.identityTitle')}
        </h2>
        <IdentityPanel />
      </section>

      <section className="flow-step" aria-labelledby="document-title">
        <h2 id="document-title" className="section-title">
          <span className="step-num">2</span>
          {t('import.documentTitle')}
        </h2>
        {status === 'verified' ? (
          <ImportPanel />
        ) : (
          <div className="card locked-card">
            <p className="locked">
              <LockIcon />
              {status === 'loading' ? t('identity.checking') : t('import.locked')}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
