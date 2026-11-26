'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { formatClaimValue, shortAddress } from '@/lib/format.ts'
import type { MessageKey } from '@/lib/i18n/messages.ts'
import { holderStatus } from '@/lib/status.ts'

import { useI18n } from './I18nProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { useVault } from './VaultProvider.tsx'

interface RequestView {
  requestId: string
  requester: string
  attribute: string
  purpose: string
  expiresAt: string
  role: 'requester' | 'holder' | 'visitor'
  state: 'pending' | 'refused' | 'allowed' | 'shared' | 'withdrawn' | 'expired' | 'answered'
}

const closedCopy: Record<string, MessageKey> = {
  refused: 'request.closed.refused',
  withdrawn: 'request.closed.withdrawn',
  expired: 'request.closed.expired',
  answered: 'request.closed.answered',
}

export function RequestReview({ requestId }: { requestId: string }) {
  const { items, request, open, share, refuse, withdraw } = useVault()
  const { t, attr, error: te, date, locale } = useI18n()
  const [view, setView] = useState<RequestView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [preview, setPreview] = useState<
    Record<string, Parameters<typeof formatClaimValue>[0] | 'error'>
  >({})
  const started = useRef(new Set<string>())

  const load = useCallback(async () => {
    try {
      const res = await request(`/api/requests/${requestId}`)
      setView((await res.json()) as RequestView)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request.loadFailed')
    }
  }, [request, requestId])

  useEffect(() => {
    void load()
  }, [load])

  const matching = view ? items.filter((item) => item.attribute === view.attribute) : []

  // Show the holder what they would share, decrypted in this browser only.
  useEffect(() => {
    for (const item of matching) {
      if (started.current.has(item.reference)) continue
      started.current.add(item.reference)
      open(item)
        .then((claim) => setPreview((p) => ({ ...p, [item.reference]: claim.value })))
        .catch(() => setPreview((p) => ({ ...p, [item.reference]: 'error' })))
    }
  }, [matching, open])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('request.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!view) {
    return error ? (
      <p role="alert" className="error">
        {error === 'request.loadFailed' ? t('request.loadFailed') : te(error)}
      </p>
    ) : (
      <div className="card request-review" aria-busy="true">
        <p className="hint loading-line">
          <span className="spinner" aria-hidden="true" />
          {t('request.loading')}
        </p>
      </div>
    )
  }

  const name = attr(view.attribute)
  const closed = closedCopy[view.state]
  const shown = (reference: string) => {
    const value = preview[reference]
    if (value === undefined) return t('request.decrypting')
    if (value === 'error') return t('request.cannotOpen')
    return formatClaimValue(value, locale)
  }
  const item = matching.find((i) => i.reference === chosen)

  return (
    <div className="card request-review">
      <dl className="request-facts">
        <div>
          <dt>{t('request.requester')}</dt>
          <dd>
            <span className="address" title={view.requester}>
              {shortAddress(view.requester)}
            </span>
            {view.role === 'requester' && <span className="hint"> {t('common.you')}</span>}
          </dd>
        </div>
        <div>
          <dt>{t('request.asksFor')}</dt>
          <dd>
            <strong>{t('request.nothingElse', { name })}</strong>
          </dd>
        </div>
        <div>
          <dt>{t('request.because')}</dt>
          <dd className="purpose">{view.purpose}</dd>
        </div>
        <div>
          <dt>{t('request.before')}</dt>
          <dd>{date(view.expiresAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        </div>
      </dl>

      {view.state === 'pending' && (
        <>
          {matching.length === 0 ? (
            <div className="empty-inline">
              <p>{t('request.noMatch', { name })}</p>
              <Link href="/import" className="button quiet">
                {t('request.importCta')}
              </Link>
            </div>
          ) : (
            <fieldset className="field choices">
              <legend>{t('request.which')}</legend>
              {matching.map((i) => (
                <label key={i.reference} className="check choice">
                  <input
                    type="radio"
                    name="item"
                    value={i.reference}
                    checked={chosen === i.reference}
                    onChange={() => setChosen(i.reference)}
                  />
                  <span>{shown(i.reference)}</span>
                  <StatusBadge status={holderStatus(i.sourceClass)} />
                </label>
              ))}
            </fieldset>
          )}
          <p className="hint">{t('request.shareHint')}</p>
          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={busy || !item}
              onClick={() => item && act(() => share(view.requestId, item))}
            >
              {busy ? t('request.sharing') : t('request.share')}
            </button>
            <button
              type="button"
              className="button quiet"
              disabled={busy}
              onClick={() => act(() => refuse(view.requestId))}
            >
              {t('request.refuse')}
            </button>
          </div>
        </>
      )}

      {(view.state === 'shared' || view.state === 'allowed') && (
        <div className="outcome">
          <h2>{view.state === 'shared' ? t('request.shared', { name }) : t('request.allowed')}</h2>
          <p className="hint">{t('request.withdrawHint')}</p>
          <div className="actions">
            <button
              type="button"
              className="button quiet"
              disabled={busy}
              onClick={() => act(() => withdraw(view.requestId))}
            >
              {t('request.withdraw')}
            </button>
          </div>
        </div>
      )}

      {closed && <p className="outcome">{t(closed)}</p>}

      {error && (
        <p role="alert" className="error">
          {te(error)}
        </p>
      )}
    </div>
  )
}
