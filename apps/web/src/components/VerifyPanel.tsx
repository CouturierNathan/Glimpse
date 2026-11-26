'use client'

import type { VerificationResult } from '@glimpse/shared'
import { generateOpaqueId } from '@glimpse/vault'
import { requestDomain, requestMessage, requestTypes } from '@glimpse/verifier'
import { type FormEvent, useEffect, useState } from 'react'
import { isAddressEqual } from 'viem'
import { signTypedData, switchChain } from 'wagmi/actions'

import { appChain } from '@/lib/chains.ts'
import { formatClaimValue } from '@/lib/format.ts'
import type { MessageKey } from '@/lib/i18n/messages.ts'
import { statusKeys } from '@/lib/status.ts'
import { importAttributes } from '@/lib/vault/attributes.ts'
import { checkNames, outcomeNames, verifyShared } from '@/lib/verify-client.ts'
import { wagmiConfig } from '@/lib/wagmi.ts'
import { MAX_PURPOSE_LENGTH } from '@/lib/request-limits.ts'

import { useI18n } from './I18nProvider.tsx'
import { connectedAddress, describeWalletError, useSession } from './SessionProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { useVault } from './VaultProvider.tsx'

/** Long enough to hand the link over, short enough that a stale link stops working. */
const REQUEST_LIFETIME_MS = 30 * 60 * 1000
const POLL_MS = 3000

type Step =
  | { name: 'form'; error?: string }
  | { name: 'signing' }
  | { name: 'waiting'; requestId: string; attribute: string }
  | { name: 'closed'; requestId: string; state: string }
  | {
      name: 'result'
      result: VerificationResult
      attribute: string
      value: Parameters<typeof formatClaimValue>[0]
    }
  | { name: 'failed'; message: string }

const closedCopy: Record<string, MessageKey> = {
  refused: 'verify.closed.refused',
  expired: 'verify.closed.expired',
  withdrawn: 'verify.closed.withdrawn',
}

export function VerifyPanel() {
  const { address } = useSession()
  const { identity, request, receive } = useVault()
  const { t, attr, error: te, date, locale } = useI18n()
  const [step, setStep] = useState<Step>({ name: 'form' })
  const [copied, setCopied] = useState(false)
  // Kept out of `step`: changing step would restart the polling effect mid-verification.
  const [checking, setChecking] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const attribute = String(form.get('attribute'))
    const purpose = String(form.get('purpose')).trim()
    setStep({ name: 'signing' })
    try {
      const keys = await identity()
      const account = await connectedAddress()
      if (!address || !isAddressEqual(account, address)) {
        throw new Error('Your wallet is on another account than the one you signed in with.')
      }
      await switchChain(wagmiConfig, { chainId: appChain.id }).catch(() => undefined)
      // Whole seconds: the signed message carries Unix times.
      const now = Math.floor(Date.now() / 1000) * 1000
      const body = {
        schemaVersion: '1.0.0' as const,
        requestId: generateOpaqueId(),
        requester: account,
        attribute,
        purpose,
        recipientId: keys.recipientId,
        recipientKeyId: keys.recipientKeyId,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + REQUEST_LIFETIME_MS).toISOString(),
      }
      const signature = await signTypedData(wagmiConfig, {
        account,
        domain: requestDomain(appChain.id),
        types: requestTypes,
        primaryType: 'VerificationRequest',
        message: requestMessage(body),
      })
      await request('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          proof: { type: 'EIP712', chainId: appChain.id, signature },
        }),
      })
      setCopied(false)
      setStep({ name: 'waiting', requestId: body.requestId, attribute })
    } catch (error) {
      setStep({ name: 'form', error: describeWalletError(error) })
    }
  }

  // While the holder decides, check where the request stands every few seconds.
  useEffect(() => {
    if (step.name !== 'waiting') return
    const { requestId, attribute } = step
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const res = await request(`/api/requests/${requestId}`)
        const { state } = (await res.json()) as { state: string }
        if (cancelled || state === 'pending' || state === 'allowed') return
        clearInterval(timer)
        if (state !== 'shared') {
          setStep({ name: 'closed', requestId, state })
          return
        }
        setChecking(true)
        const { request: signed, claim } = await receive(requestId)
        const result = await verifyShared(signed, claim, signed.requester as `0x${string}`)
        setChecking(false)
        if (!cancelled) {
          setStep({ name: 'result', result, attribute, value: claim.value })
        }
      } catch (error) {
        clearInterval(timer)
        setChecking(false)
        if (!cancelled) {
          setStep({
            name: 'failed',
            message: error instanceof Error ? error.message : 'verify.failed',
          })
        }
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [step, request, receive])

  const restart = (
    <button type="button" className="button quiet" onClick={() => setStep({ name: 'form' })}>
      {t('verify.restart')}
    </button>
  )

  if (step.name === 'waiting') {
    const link = `${window.location.origin}/consent/${step.requestId}`
    return (
      <div className="card request-status" aria-live="polite">
        {!checking ? (
          <>
            <h2 className="loading-line">
              <span className="pulse" aria-hidden="true" />
              {t('verify.waiting')}
            </h2>
            <p className="hint">{t('verify.waitingHint', { name: attr(step.attribute) })}</p>
            <div className="link-row">
              <input className="link" readOnly value={link} aria-label={t('verify.link')} />
              <button
                type="button"
                className="button quiet"
                onClick={async () => {
                  await navigator.clipboard.writeText(link)
                  setCopied(true)
                }}
              >
                {copied ? t('verify.copied') : t('verify.copy')}
              </button>
            </div>
          </>
        ) : (
          <h2 className="loading-line">
            <span className="spinner" aria-hidden="true" />
            {t('verify.checking')}
          </h2>
        )}
      </div>
    )
  }

  if (step.name === 'closed') {
    return (
      <div className="card request-status">
        <h2>{t(closedCopy[step.state] ?? 'verify.closed.other')}</h2>
        <div className="actions">{restart}</div>
      </div>
    )
  }

  if (step.name === 'failed') {
    return (
      <div className="card request-status">
        <p role="alert" className="error">
          {step.message === 'verify.failed' ? t('verify.failed') : te(step.message)}
        </p>
        <div className="actions">{restart}</div>
      </div>
    )
  }

  if (step.name === 'result') {
    const { result } = step
    return (
      <div className="card request-status verdict" data-verdict={result.verdict}>
        <StatusBadge status={result.verdict} />
        <h2>
          {attr(step.attribute)}
          {locale === 'fr' ? ' : ' : ': '}
          {formatClaimValue(step.value, locale)}
        </h2>
        <p className="hint">{t(statusKeys[result.verdict].meaning)}</p>
        <dl className="checks">
          {(Object.keys(checkNames) as (keyof typeof checkNames)[]).map((check) => (
            <div key={check} data-outcome={result.checks[check]}>
              <dt>{t(checkNames[check])}</dt>
              <dd>{t(outcomeNames[result.checks[check]])}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">
          {t('verify.checkedAt', { time: date(result.checkedAt, { timeStyle: 'medium' }) })}
        </p>
        <div className="actions">{restart}</div>
      </div>
    )
  }

  return (
    <form className="card form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="attribute">{t('verify.what')}</label>
        <select id="attribute" name="attribute" defaultValue={importAttributes[0]?.attribute}>
          {importAttributes.map((a) => (
            <option key={a.attribute} value={a.attribute}>
              {attr(a.attribute)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="purpose">{t('verify.why')}</label>
        <textarea
          id="purpose"
          name="purpose"
          required
          maxLength={MAX_PURPOSE_LENGTH}
          rows={3}
          placeholder={t('verify.whyPlaceholder')}
        />
        <span className="hint">{t('verify.whyHint')}</span>
      </div>
      <div className="actions">
        <button type="submit" className="button" disabled={step.name === 'signing'}>
          {step.name === 'signing' && <span className="spinner" aria-hidden="true" />}
          {step.name === 'signing' ? t('verify.signing') : t('verify.submit')}
        </button>
      </div>
      {step.name === 'form' && step.error && (
        <p role="alert" className="error">
          {te(step.error)}
        </p>
      )}
    </form>
  )
}
