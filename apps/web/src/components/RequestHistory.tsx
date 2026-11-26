'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { type SeenRequest, seenRequests } from '@/lib/holder-store.ts'
import { type OwnRequest, ownRequests } from '@/lib/requester-store.ts'
import { fetchRequest, type ItemState, type RequestView } from '@/lib/requester.ts'

import { useI18n } from './I18nProvider.tsx'
import { stateKeys } from './RequestStatus.tsx'

/** Live state for a stored request, once the server has answered for it. */
type Live = Record<string, RequestView | null>

/** Where a request stands as a whole, for the chip on the summary line. */
function overall(states: ItemState[], expiresAt: string): ItemState {
  if (states.some((s) => s === 'shared')) return 'shared'
  if (states.some((s) => s === 'allowed')) return 'allowed'
  if (states.every((s) => s === 'refused')) return 'refused'
  if (states.some((s) => s === 'withdrawn')) return 'withdrawn'
  if (Date.parse(expiresAt) <= Date.now()) return 'expired'
  return states.some((s) => s === 'pending') ? 'pending' : 'answered'
}

function Row({
  requestId,
  who,
  purpose,
  createdAt,
  expiresAt,
  asked,
  live,
  href,
}: {
  requestId: string
  who: string
  purpose: string
  createdAt: string
  expiresAt: string
  asked: { attribute: string; shared?: boolean }[]
  live: RequestView | null
  href: Route
}) {
  const { t, attr, date } = useI18n()
  const states = live?.items.map((i) => i.state) ?? []
  const state = states.length > 0 ? overall(states, expiresAt) : undefined
  const sharedNames = live
    ? live.items.filter((i) => i.state === 'shared').map((i) => attr(i.attribute))
    : asked.filter((a) => a.shared).map((a) => attr(a.attribute))

  return (
    <li className="card history-row">
      <div className="history-head">
        <strong>{who}</strong>
        {state && (
          <span className="state" data-state={state}>
            {t(stateKeys[state])}
          </span>
        )}
      </div>
      <p className="purpose">{purpose}</p>
      <dl className="request-facts compact">
        <div>
          <dt>{t('history.asked')}</dt>
          <dd>{asked.map((a) => attr(a.attribute)).join(', ')}</dd>
        </div>
        <div>
          <dt>{t('history.shared')}</dt>
          <dd>{sharedNames.length > 0 ? sharedNames.join(', ') : t('history.nothing')}</dd>
        </div>
        <div>
          <dt>{t('history.on')}</dt>
          <dd>{date(createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        </div>
        <div>
          <dt>{Date.parse(expiresAt) <= Date.now() ? t('history.expired') : t('history.until')}</dt>
          <dd>{date(expiresAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        </div>
      </dl>
      <div className="actions">
        <Link href={href} className="button quiet small">
          {t('history.details')}
        </Link>
      </div>
      <p className="hint request-id">
        <code>{requestId.slice(0, 8)}</code>
      </p>
    </li>
  )
}

/**
 * Everything this browser has been asked, and everything it has asked for.
 *
 * Both lists are this browser's own: the server routes requests but knows no account to hang a
 * history on, so the record of what was asked and agreed to lives beside the keys that opened it.
 * The state of each one is re-read from the server, so a withdrawal or an expiry shows here too.
 */
export function RequestHistory() {
  const { t } = useI18n()
  const [received, setReceived] = useState<SeenRequest[] | null>(null)
  const [sent, setSent] = useState<OwnRequest[] | null>(null)
  const [live, setLive] = useState<Live>({})

  useEffect(() => {
    seenRequests()
      .then(setReceived)
      .catch(() => setReceived([]))
    ownRequests()
      .then(setSent)
      .catch(() => setSent([]))
  }, [])

  // One read per request, so a state that changed after the answer is not shown as it was.
  useEffect(() => {
    const ids = [
      ...(received ?? []).map((r) => r.requestId),
      ...(sent ?? []).map((r) => r.requestId),
    ]
    for (const id of new Set(ids)) {
      if (id in live) continue
      setLive((current) => ({ ...current, [id]: null }))
      fetchRequest(id)
        .then((view) => setLive((current) => ({ ...current, [id]: view })))
        .catch(() => undefined)
    }
  }, [received, sent, live])

  if (!received || !sent) {
    return (
      <p className="hint loading-line" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        {t('history.loading')}
      </p>
    )
  }

  if (received.length === 0 && sent.length === 0) {
    return <p className="hint">{t('history.empty')}</p>
  }

  return (
    <div className="stack">
      {received.length > 0 && (
        <section>
          <h3 className="section-title">{t('history.received')}</h3>
          <ul className="history">
            {received.map((entry) => (
              <Row
                key={entry.requestId}
                requestId={entry.requestId}
                who={entry.requesterName}
                purpose={entry.purpose}
                createdAt={entry.createdAt}
                expiresAt={entry.expiresAt}
                asked={entry.items}
                live={live[entry.requestId] ?? null}
                href={`/consent/${entry.requestId}` as Route}
              />
            ))}
          </ul>
        </section>
      )}

      {sent.length > 0 && (
        <section>
          <h3 className="section-title">{t('history.sent')}</h3>
          <ul className="history">
            {sent.map((entry) => (
              <Row
                key={entry.requestId}
                requestId={entry.requestId}
                who={entry.requesterName}
                purpose={entry.purpose}
                createdAt={entry.createdAt}
                expiresAt={entry.expiresAt}
                asked={entry.requests.map((r) => ({ attribute: r.attribute }))}
                live={live[entry.requestId] ?? null}
                href={`/verify/${entry.requestId}` as Route}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
