'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { formatClaimValue } from '@/lib/format.ts'
import type { MessageKey } from '@/lib/i18n/messages.ts'
import {
  fetchRequest,
  type ItemState,
  type Received,
  receive,
  type RequestView,
} from '@/lib/requester.ts'
import { type OwnRequest, ownRequest } from '@/lib/requester-store.ts'
import { statusKeys } from '@/lib/status.ts'
import { checkNames, outcomeNames } from '@/lib/verify-client.ts'

import { CopyLink } from './CopyLink.tsx'
import { ErrorNotice, Notice } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'

const POLL_MS = 4000

export const stateKeys: Record<ItemState, MessageKey> = {
  pending: 'state.pending',
  refused: 'state.refused',
  allowed: 'state.allowed',
  shared: 'state.shared',
  withdrawn: 'state.withdrawn',
  expired: 'state.expired',
  answered: 'state.answered',
}

/** The requester follows its request: the link to send, then each answer, verified here. */
export function RequestStatus({ requestId }: { requestId: string }) {
  const { t, attr, date, locale } = useI18n()
  const [own, setOwn] = useState<OwnRequest | null | undefined>(undefined)
  const [view, setView] = useState<RequestView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [received, setReceived] = useState<Record<string, Received | { error: string }>>({})
  const started = useRef(new Set<string>())

  useEffect(() => {
    ownRequest(requestId)
      .then((found) => setOwn(found ?? null))
      .catch(() => setOwn(null))
  }, [requestId])

  const load = useCallback(async () => {
    if (!own) return
    try {
      setView(await fetchRequest(requestId, own))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('request.loadFailed'))
    }
  }, [own, requestId, t])

  useEffect(() => {
    if (!own) return
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [own, load])

  // Each shared piece is downloaded and verified once, in this browser.
  useEffect(() => {
    if (!own || !view) return
    for (const item of view.items) {
      if (item.state !== 'shared' || started.current.has(item.requestId)) continue
      started.current.add(item.requestId)
      receive(own, item.requestId)
        .then((result) => setReceived((r) => ({ ...r, [item.requestId]: result })))
        .catch((err: unknown) =>
          setReceived((r) => ({
            ...r,
            [item.requestId]: { error: err instanceof Error ? err.message : t('verify.failed') },
          })),
        )
    }
  }, [own, view, t])

  if (own === undefined) {
    return <Loading label={t('request.loading')} />
  }
  if (own === null) {
    return (
      <Notice
        tone="info"
        title={t('status.otherBrowser.title')}
        action={
          <Link href="/verify" className="button quiet small">
            {t('status.newRequest')}
          </Link>
        }
      >
        {t('status.otherBrowser.text')}
      </Notice>
    )
  }

  const link = `${typeof window === 'undefined' ? '' : window.location.origin}/consent/${requestId}`
  const expired = Date.parse(own.expiresAt) <= Date.now()

  return (
    <div className="stack">
      <div className="card">
        <h3>{t('status.share.title')}</h3>
        <p className="hint">{t('status.share.text')}</p>
        <CopyLink link={link} label={t('verify.link')} />
        <dl className="request-facts compact">
          <div>
            <dt>{t('request.requester')}</dt>
            <dd>{own.requesterName}</dd>
          </div>
          <div>
            <dt>{t('request.because')}</dt>
            <dd className="purpose">{own.purpose}</dd>
          </div>
          <div>
            <dt>{expired ? t('status.expiredOn') : t('request.before')}</dt>
            <dd>{date(own.expiresAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          </div>
        </dl>
      </div>

      <ErrorNotice message={error} />

      <h2 className="section-title">{t('status.answers')}</h2>
      {!view ? (
        <Loading label={t('request.loading')} />
      ) : (
        <ul className="answers">
          {view.items.map((item) => {
            const got = received[item.requestId]
            return (
              <li key={item.requestId} className="card answer" data-state={item.state}>
                <div className="answer-head">
                  <strong>{attr(item.attribute)}</strong>
                  {got && 'result' in got ? (
                    <StatusBadge status={got.result.verdict} />
                  ) : (
                    <span className="state" data-state={item.state}>
                      {(item.state === 'pending' || item.state === 'allowed') && !expired && (
                        <span className="pulse" aria-hidden="true" />
                      )}
                      {t(stateKeys[item.state])}
                    </span>
                  )}
                </div>
                {item.state === 'shared' && !got && <Loading label={t('verify.checking')} />}
                {got && 'error' in got && <ErrorNotice message={got.error} />}
                {got && 'result' in got && (
                  <>
                    <p className="answer-value">{formatClaimValue(got.claim.value, locale)}</p>
                    <p className="hint">{t(statusKeys[got.result.verdict].meaning)}</p>
                    <details className="disclosure">
                      <summary>{t('status.checks')}</summary>
                      <dl className="checks">
                        {(Object.keys(checkNames) as (keyof typeof checkNames)[]).map((check) => (
                          <div key={check} data-outcome={got.result.checks[check]}>
                            <dt>{t(checkNames[check])}</dt>
                            <dd>{t(outcomeNames[got.result.checks[check]])}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="hint">
                        {t('verify.checkedAt', {
                          time: date(got.result.checkedAt, { timeStyle: 'medium' }),
                        })}
                      </p>
                    </details>
                    {item.state === 'withdrawn' && (
                      <p className="hint">{t('status.withdrawnAfter')}</p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <p className="hint loading-line" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </p>
  )
}
