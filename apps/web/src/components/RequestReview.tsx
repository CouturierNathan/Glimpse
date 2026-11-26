'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

import { formatClaimValue } from '@/lib/format.ts'
import { rememberRequest } from '@/lib/holder-store.ts'
import { fetchRequest, type RequestView } from '@/lib/requester.ts'
import { holderStatus } from '@/lib/status.ts'

import { ConfirmButton, ErrorNotice, FieldError, Notice, useFieldErrors } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { stateKeys } from './RequestStatus.tsx'
import { useSession } from './SessionProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { useVault, type VaultItem } from './VaultProvider.tsx'

type Preview = Parameters<typeof formatClaimValue>[0] | 'error'

/**
 * The holder's side of a request link. Anyone can read what is asked and by whom; answering needs
 * the holder's vault. The holder ticks what they agree to share, item by item: each ticked piece
 * is re-encrypted for the requester in this browser, the others are refused.
 */
export function RequestReview({ requestId }: { requestId: string }) {
  const { status } = useSession()
  const { items, ready, open, share, refuse, withdraw } = useVault()
  const { t, attr, date, locale } = useI18n()
  const fields = useFieldErrors()
  const [view, setView] = useState<RequestView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState<Record<string, string | null>>({})
  const [preview, setPreview] = useState<Record<string, Preview>>({})
  const started = useRef(new Set<string>())

  const load = useCallback(async () => {
    try {
      setView(await fetchRequest(requestId))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('request.loadFailed'))
    }
  }, [requestId, t])

  // Reloaded when the session changes: the holder who answered sees their own answers.
  useEffect(() => {
    void load()
  }, [load, status])

  const asked = new Set(view?.items.map((i) => i.attribute))
  const matching = items.filter((item) => asked.has(item.attribute))

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
    } catch (e) {
      setError(e instanceof Error ? e.message : t('request.failed'))
    } finally {
      await load()
      setBusy(false)
    }
  }

  function onShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!view) return
    const picks = view.items.map((item) => ({
      item,
      share: matching.find((m) => m.reference === chosen[item.requestId]) ?? null,
    }))
    if (
      !fields.report(
        { choice: picks.some((p) => p.share) ? undefined : t('request.pickOne') },
        event.currentTarget,
      )
    ) {
      return
    }
    void act(async () => {
      for (const { item, share: picked } of picks) {
        if (item.state !== 'pending') continue
        if (picked) await share(item.requestId, picked)
        else await refuse(item.requestId)
      }
      // The holder's own record of what they agreed to. It never leaves this browser.
      await rememberRequest({
        requestId,
        requesterName: view.requesterName,
        purpose: view.purpose,
        createdAt: view.createdAt,
        expiresAt: view.expiresAt,
        answeredAt: new Date().toISOString(),
        items: picks.map(({ item, share: picked }) => ({
          requestId: item.requestId,
          attribute: item.attribute,
          shared: Boolean(picked),
        })),
      }).catch(() => undefined)
    })
  }

  if (!view) {
    return loadError ? (
      <ErrorNotice message={loadError} />
    ) : (
      <div className="card" aria-busy="true">
        <p className="hint loading-line">
          <span className="spinner" aria-hidden="true" />
          {t('request.loading')}
        </p>
      </div>
    )
  }

  const shown = (value: Preview | undefined) =>
    value === undefined
      ? t('request.decrypting')
      : value === 'error'
        ? t('request.cannotOpen')
        : formatClaimValue(value, locale)

  const facts = (
    <dl className="request-facts">
      <div>
        <dt>{t('request.requester')}</dt>
        <dd>
          <strong>{view.requesterName}</strong>
          <span className="hint block">{t('request.declared')}</span>
        </dd>
      </div>
      <div>
        <dt>{t('request.asksFor')}</dt>
        <dd>
          <ul className="tags">
            {view.items.map((item) => (
              <li key={item.requestId}>{attr(item.attribute)}</li>
            ))}
          </ul>
        </dd>
      </div>
      <div>
        <dt>{t('request.because')}</dt>
        <dd className="purpose">{view.purpose}</dd>
      </div>
      <div>
        <dt>{view.status === 'expired' ? t('status.expiredOn') : t('request.before')}</dt>
        <dd>{date(view.expiresAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
      </div>
    </dl>
  )

  // The holder who answered: where each piece stands, and the way back.
  if (view.role === 'holder') {
    const live = view.items.filter((i) => i.state === 'shared' || i.state === 'allowed')
    return (
      <div className="card request-review">
        {facts}
        <ul className="answers compact">
          {view.items.map((item) => (
            <li key={item.requestId} className="answer-head">
              <span>{attr(item.attribute)}</span>
              <span className="state" data-state={item.state}>
                {t(stateKeys[item.state])}
              </span>
            </li>
          ))}
        </ul>
        {live.length > 0 && (
          <>
            <p className="hint">{t('request.withdrawHint')}</p>
            <div className="actions">
              <ConfirmButton
                className="button quiet"
                label={t('request.withdraw')}
                disabled={busy}
                title={t('request.withdrawTitle')}
                text={t('request.withdrawText')}
                confirmLabel={t('request.withdraw')}
                onConfirm={() =>
                  void act(async () => {
                    for (const item of live) await withdraw(item.requestId)
                  })
                }
              />
            </div>
          </>
        )}
        <ErrorNotice message={error} />
      </div>
    )
  }

  if (view.status !== 'open') {
    return (
      <div className="card request-review">
        {facts}
        <Notice tone="info">
          {view.status === 'expired' ? t('request.closed.expired') : t('request.closed.answered')}
        </Notice>
      </div>
    )
  }

  if (status !== 'signed-in') {
    return (
      <div className="card request-review">
        {facts}
        <Notice
          tone="info"
          title={t('request.signIn.title')}
          action={
            status !== 'loading' && (
              <Link href={`/login?next=/consent/${requestId}`} className="button small">
                {t('request.signIn.cta')}
              </Link>
            )
          }
        >
          {t('request.signIn.text')}
        </Notice>
      </div>
    )
  }

  return (
    <form className="card request-review" onSubmit={onShare} noValidate>
      {facts}
      <fieldset className="field" data-invalid={fields.errors.choice ? '' : undefined}>
        <legend>{t('request.which')}</legend>
        <span className="hint">{t('request.whichHint')}</span>
        {!ready && (
          <p className="hint loading-line">
            <span className="spinner" aria-hidden="true" />
            {t('request.decrypting')}
          </p>
        )}
        <div className="share-list">
          {view.items.map((item, index) => {
            const options = matching.filter((m) => m.attribute === item.attribute)
            return (
              <div key={item.requestId} className="share-row">
                <strong>{attr(item.attribute)}</strong>
                {options.length === 0 ? (
                  <span className="hint">{t('request.notInVault')}</span>
                ) : (
                  <div className="share-options">
                    {options.map((option: VaultItem, i) => (
                      <label key={option.reference} className="check choice">
                        <input
                          type="radio"
                          name={`share-${item.requestId}`}
                          checked={chosen[item.requestId] === option.reference}
                          onChange={() => {
                            setChosen((c) => ({ ...c, [item.requestId]: option.reference }))
                            fields.clear('choice')
                          }}
                          {...(index === 0 && i === 0 ? { 'data-field': 'choice' } : {})}
                        />
                        <span>{shown(preview[option.reference])}</span>
                        <StatusBadge status={holderStatus(option.sourceClass)} />
                      </label>
                    ))}
                    <label className="check choice">
                      <input
                        type="radio"
                        name={`share-${item.requestId}`}
                        checked={!chosen[item.requestId]}
                        onChange={() => setChosen((c) => ({ ...c, [item.requestId]: null }))}
                      />
                      <span className="muted">{t('request.dontShare')}</span>
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <FieldError name="choice" message={fields.errors.choice} />
      </fieldset>
      {matching.length === 0 && ready && (
        <Notice
          tone="info"
          action={
            <Link href="/import" className="button quiet small">
              {t('request.importCta')}
            </Link>
          }
        >
          {t('request.emptyVault')}
        </Notice>
      )}
      <p className="hint">{t('request.shareHint')}</p>
      <div className="actions">
        <button type="submit" className="button" disabled={busy || matching.length === 0}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? t('request.sharing') : t('request.shareSelection')}
        </button>
        <ConfirmButton
          className="button quiet"
          label={t('request.refuseAll')}
          disabled={busy}
          title={t('request.refuseTitle')}
          text={t('request.refuseText')}
          confirmLabel={t('request.refuseAll')}
          onConfirm={() =>
            void act(async () => {
              for (const item of view.items) {
                if (item.state === 'pending') await refuse(item.requestId)
              }
            })
          }
        />
      </div>
      <ErrorNotice message={error} />
    </form>
  )
}
