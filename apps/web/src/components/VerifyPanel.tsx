'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'

import {
  MAX_ATTRIBUTES_PER_REQUEST,
  MAX_PURPOSE_LENGTH,
  MAX_REQUESTER_NAME_LENGTH,
  REQUEST_LIFETIMES_HOURS,
} from '@/lib/request-limits.ts'
import { createRequest } from '@/lib/requester.ts'
import { forgetOwnRequest, type OwnRequest, ownRequests } from '@/lib/requester-store.ts'
import { attributeCategories, attributesOf } from '@/lib/vault/attributes.ts'

import { ConfirmButton, ErrorNotice, FieldError, useFieldErrors } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { Select } from './Select.tsx'

/**
 * The requester's side: ask for one or more pieces of information, without a wallet or an
 * account, then follow the answers. The requests live in this browser.
 */
export function VerifyPanel() {
  const { t, attr } = useI18n()
  const router = useRouter()
  const fields = useFieldErrors()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const requesterName = String(data.get('requesterName') ?? '').trim()
    const purpose = String(data.get('purpose') ?? '').trim()
    const attributes = data.getAll('info').map(String)
    const lifetimeHours = Number(data.get('lifetime'))
    const ok = fields.report(
      {
        requesterName: !requesterName ? t('form.required') : undefined,
        attributes:
          attributes.length === 0
            ? t('verify.pickOne')
            : attributes.length > MAX_ATTRIBUTES_PER_REQUEST
              ? t('verify.tooMany', { max: MAX_ATTRIBUTES_PER_REQUEST })
              : undefined,
        purpose: !purpose ? t('form.required') : undefined,
      },
      form,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const id = await createRequest({ requesterName, purpose, attributes, lifetimeHours })
      router.push(`/verify/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verify.createFailed'))
      setBusy(false)
    }
  }

  return (
    <>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="requesterName">{t('verify.name')}</label>
          <input
            id="requesterName"
            name="requesterName"
            maxLength={MAX_REQUESTER_NAME_LENGTH}
            placeholder={t('verify.namePlaceholder')}
            autoComplete="organization"
            {...fields.control('requesterName')}
          />
          <span className="hint">{t('verify.nameHint')}</span>
          <FieldError name="requesterName" message={fields.errors.requesterName} />
        </div>

        <fieldset
          className="field"
          aria-describedby={fields.errors.attributes ? 'attributes-error' : undefined}
          data-invalid={fields.errors.attributes ? '' : undefined}
        >
          <legend>{t('verify.what')}</legend>
          <span className="hint">{t('verify.whatHint', { max: MAX_ATTRIBUTES_PER_REQUEST })}</span>
          <div className="groups">
            {attributeCategories.map((group) => (
              <div key={group.category} className="group">
                <strong>{t(`cat.${group.category}`)}</strong>
                <div className="checks-grid">
                  {attributesOf(group.category).map((a, i) => (
                    <label key={a.attribute} className="check">
                      <input
                        type="checkbox"
                        name="info"
                        value={a.attribute}
                        onChange={() => fields.clear('attributes')}
                        {...(group.category === 'identity' && i === 0
                          ? { 'data-field': 'attributes' }
                          : {})}
                      />
                      {attr(a.attribute)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <FieldError name="info" message={fields.errors.attributes} />
        </fieldset>

        <div className="field">
          <label htmlFor="purpose">{t('verify.why')}</label>
          <textarea
            id="purpose"
            name="purpose"
            maxLength={MAX_PURPOSE_LENGTH}
            rows={3}
            placeholder={t('verify.whyPlaceholder')}
            {...fields.control('purpose')}
          />
          <span className="hint">{t('verify.whyHint')}</span>
          <FieldError name="purpose" message={fields.errors.purpose} />
        </div>

        <div className="field">
          <label htmlFor="lifetime">{t('verify.lifetime')}</label>
          <Select
            id="lifetime"
            name="lifetime"
            defaultValue="24"
            options={REQUEST_LIFETIMES_HOURS.map((hours) => ({
              value: String(hours),
              label: t(`verify.lifetime.${hours}`),
            }))}
          />
        </div>

        <div className="actions">
          <button type="submit" className="button" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? t('verify.creating') : t('verify.submit')}
          </button>
        </div>
        <p className="hint">{t('verify.noWallet')}</p>
        <ErrorNotice message={error} />
      </form>

      <OwnRequests />
    </>
  )
}

/** The requests this browser created, newest first. */
function OwnRequests() {
  const { t, date, attr } = useI18n()
  const [list, setList] = useState<OwnRequest[] | null>(null)

  useEffect(() => {
    ownRequests()
      .then(setList)
      .catch(() => setList([]))
  }, [])

  if (!list || list.length === 0) return null

  return (
    <>
      <h2 className="section-title">{t('verify.mine')}</h2>
      <ul className="card list">
        {list.map((own) => {
          const expired = Date.parse(own.expiresAt) <= Date.now()
          return (
            <li key={own.requestId} className="list-row">
              <div>
                <Link href={`/verify/${own.requestId}`} className="list-title">
                  {own.requests.map((r) => attr(r.attribute)).join(', ')}
                </Link>
                <span className="hint">
                  {expired
                    ? t('verify.expiredOn', { date: date(own.expiresAt, { dateStyle: 'medium' }) })
                    : t('verify.until', {
                        date: date(own.expiresAt, { dateStyle: 'medium', timeStyle: 'short' }),
                      })}
                </span>
              </div>
              <div className="item-actions">
                <Link href={`/verify/${own.requestId}`} className="button quiet small">
                  {t('verify.open')}
                </Link>
                <ConfirmButton
                  label={t('verify.forget')}
                  title={t('verify.forgetTitle')}
                  text={t('verify.forgetText')}
                  confirmLabel={t('verify.forget')}
                  onConfirm={() =>
                    void forgetOwnRequest(own.requestId).then(() =>
                      setList((current) =>
                        (current ?? []).filter((r) => r.requestId !== own.requestId),
                      ),
                    )
                  }
                />
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
