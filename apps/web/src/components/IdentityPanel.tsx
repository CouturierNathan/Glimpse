'use client'

import type { IdentityValidationReport } from '@glimpse/shared'
import { type FormEvent, useState } from 'react'
import { signMessage } from 'wagmi/actions'

import type { MessageKey } from '@/lib/i18n/messages.ts'
import { wagmiConfig } from '@/lib/wagmi.ts'

import { FilePicker } from './FilePicker.tsx'
import { useI18n } from './I18nProvider.tsx'
import { useIdentity } from './IdentityProvider.tsx'
import { connectedAddress, describeWalletError } from './SessionProvider.tsx'
import { useVault } from './VaultProvider.tsx'

type Step =
  | { name: 'idle' }
  | { name: 'checking' }
  | { name: 'failed'; reason: MessageKey }
  | { name: 'passed'; report: IdentityValidationReport; binding: string }
  | { name: 'signing'; report: IdentityValidationReport; binding: string }

/** Why a proof failed, in one sentence; the report's details stay on the server side. */
function failureReason(report: IdentityValidationReport, nameFound: boolean): MessageKey {
  if (report.indication === 'TOTAL_PASSED') {
    return nameFound ? 'identity.reason.unknown' : 'identity.reason.noName'
  }
  return report.subIndication
    ? (`identity.reason.${report.subIndication}` as MessageKey)
    : 'identity.reason.unknown'
}

export function VerifiedBadge() {
  const { t } = useI18n()
  return (
    <div className="card verified" role="status">
      <span className="verified-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="m6 12.5 4 4 8-9" />
        </svg>
      </span>
      <div>
        <strong>{t('identity.verified')}</strong>
        <p className="hint">{t('identity.verifiedText')}</p>
      </div>
    </div>
  )
}

/**
 * The France Identité check: the server validates the PDF's signature and reads the name, then the
 * wallet signs a binding to it. Once done, only a success state remains.
 */
export function IdentityPanel() {
  const { request } = useVault()
  const { status, refresh } = useIdentity()
  const { t, error: te } = useI18n()
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const [error, setError] = useState<string | null>(null)

  if (status === 'verified') return <VerifiedBadge />
  if (status === 'loading') {
    return (
      <div className="card" aria-busy="true">
        <p className="hint loading-line">
          <span className="spinner" aria-hidden="true" />
          {t('identity.checking')}
        </p>
      </div>
    )
  }

  async function onCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const chosen = new FormData(event.currentTarget).get('file')
    if (!(chosen instanceof File) || chosen.size === 0) {
      setError(t('identity.chooseFirst'))
      return
    }
    const form = new FormData()
    form.set('file', chosen)
    setError(null)
    setStep({ name: 'checking' })
    try {
      const res = await request('/api/identity/verify', { method: 'POST', body: form })
      const body = (await res.json()) as {
        report: IdentityValidationReport
        binding: string | null
        nameFound?: boolean
      }
      setStep(
        body.binding
          ? { name: 'passed', report: body.report, binding: body.binding }
          : { name: 'failed', reason: failureReason(body.report, Boolean(body.nameFound)) },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t('identity.reason.unknown'))
      setStep({ name: 'idle' })
    }
  }

  async function onBind(report: IdentityValidationReport, binding: string) {
    setError(null)
    setStep({ name: 'signing', report, binding })
    try {
      await connectedAddress()
      const signature = await signMessage(wagmiConfig, { message: binding })
      await request('/api/identity/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.reportId, signature }),
      })
      await refresh()
    } catch (err) {
      setError(describeWalletError(err))
      setStep({ name: 'passed', report, binding })
    }
  }

  const alert = error && (
    <p role="alert" className="error">
      {te(error)}
    </p>
  )

  const progress = (
    <ol className="progress" aria-label={t('import.identityTitle')}>
      <li data-state={step.name === 'passed' || step.name === 'signing' ? 'done' : 'current'}>
        {t('identity.step1')}
      </li>
      <li data-state={step.name === 'passed' || step.name === 'signing' ? 'current' : undefined}>
        {t('identity.step2')}
      </li>
    </ol>
  )

  if (step.name === 'failed') {
    return (
      <div className="card result failed" role="alert">
        <h3>{t('identity.failed')}</h3>
        <p>{t(step.reason)}</p>
        <div className="actions">
          <button type="button" className="button quiet" onClick={() => setStep({ name: 'idle' })}>
            {t('identity.retry')}
          </button>
        </div>
      </div>
    )
  }

  if (step.name === 'passed' || step.name === 'signing') {
    return (
      <div className="card result" role="status">
        {progress}
        <h3>{t('identity.passed')}</h3>
        <p className="hint">{t('identity.passedText')}</p>
        <details className="disclosure">
          <summary>{t('identity.bindWarning')}</summary>
          <p className="hint">{t('identity.warning')}</p>
        </details>
        <div className="actions">
          <button
            type="button"
            className="button"
            disabled={step.name === 'signing'}
            onClick={() => onBind(step.report, step.binding)}
          >
            {step.name === 'signing' && <span className="spinner" aria-hidden="true" />}
            {step.name === 'signing' ? t('identity.signBusy') : t('identity.sign')}
          </button>
          {step.name !== 'signing' && (
            <button
              type="button"
              className="button quiet"
              onClick={() => setStep({ name: 'idle' })}
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
        {alert}
      </div>
    )
  }

  return (
    <form className="card form" onSubmit={onCheck}>
      {progress}
      <FilePicker
        name="file"
        accept=".pdf,application/pdf"
        label={t('identity.file')}
        buttonLabel={t('identity.fileButton')}
        hint={t('identity.fileHint')}
      />
      <div className="actions">
        <button type="submit" className="button" disabled={step.name === 'checking'}>
          {step.name === 'checking' && <span className="spinner" aria-hidden="true" />}
          {step.name === 'checking' ? t('identity.submitBusy') : t('identity.submit')}
        </button>
      </div>
      {alert}
    </form>
  )
}
