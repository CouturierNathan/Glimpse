'use client'

import type { DocumentReference, DocumentUploadRequest, ExtractedClaim } from '@glimpse/shared'
import { generateOpaqueId } from '@glimpse/vault'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'

import type { MessageKey } from '@/lib/i18n/messages.ts'
import { formatClaimValue } from '@/lib/format.ts'
import { holderStatus } from '@/lib/status.ts'
import {
  attributeCategories,
  attributesOf,
  IMPORT_DOCUMENT_KIND,
  MAX_ATTRIBUTES_PER_IMPORT,
  NAME_ATTRIBUTE,
  uploadMediaType,
} from '@/lib/vault/attributes.ts'
import { rawClaimValue, reviewClaim } from '@/lib/vault/review.ts'

import { FilePicker } from './FilePicker.tsx'
import { useI18n } from './I18nProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { useVault, VaultError } from './VaultProvider.tsx'

type Step =
  | { name: 'idle' }
  | { name: 'reading' }
  | {
      name: 'review'
      claims: ExtractedClaim[]
      source: DocumentReference
      missing: string[]
      error?: string
    }
  | { name: 'encrypting' }
  | { name: 'done'; stored: ExtractedClaim[]; missing: string[]; signed: boolean }
  | { name: 'error'; message: string; code?: string }

export function ImportPanel() {
  const { request, store } = useVault()
  const { t, attr, error: te, locale } = useI18n()
  const post = (url: string, init: RequestInit) => request(url, { method: 'POST', ...init })
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const busy = step.name === 'reading' || step.name === 'encrypting'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const file = fields.get('file')
    // The name is always read: the server matches it with the verified identity.
    const attributes = [NAME_ATTRIBUTE, ...fields.getAll('attributes').map(String)]
    // The file control is off screen, so the browser cannot show a validation bubble on it.
    if (!(file instanceof File) || file.size === 0) {
      setStep({ name: 'error', message: t('import.chooseFirst') })
      return
    }
    if (attributes.length > MAX_ATTRIBUTES_PER_IMPORT) {
      setStep({
        name: 'error',
        message: t('import.tooMany', { max: MAX_ATTRIBUTES_PER_IMPORT }),
      })
      return
    }
    if (fields.get('consent') !== 'on') {
      setStep({ name: 'error', message: t('import.consentRequired') })
      return
    }
    const upload: DocumentUploadRequest = {
      schemaVersion: '1.0.0',
      documentId: generateOpaqueId(),
      documentVersion: 1,
      kind: IMPORT_DOCUMENT_KIND,
      mediaType: uploadMediaType(file),
      attributes,
    }
    // Set here, before any extraction: an imported document is class A, whatever the model says.
    let source: DocumentReference = {
      documentId: upload.documentId,
      documentVersion: upload.documentVersion,
      provenance: { class: 'A' },
    }
    const form = new FormData()
    form.set('request', JSON.stringify(upload))
    form.set('file', file)

    try {
      setStep({ name: 'reading' })
      await post('/api/import/consent', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upload),
      })
      const res = await post('/api/import/extract', { body: form })
      const verified = (await res.json()) as { claims: ExtractedClaim[]; source: DocumentReference }
      const { claims } = verified
      // Only the server's own signature check upgrades this document, and only to class B.
      if (
        verified.source.provenance.class === 'B' &&
        verified.source.documentId === source.documentId &&
        verified.source.documentVersion === source.documentVersion
      ) {
        source = verified.source
      }

      const found = new Set(claims.map((c) => c.attribute))
      setStep({
        name: 'review',
        claims,
        source,
        missing: attributes.filter((a) => !found.has(a)),
      })
    } catch (error) {
      fail(error)
    }
  }

  function fail(error: unknown) {
    setStep({
      name: 'error',
      message: error instanceof Error ? error.message : t('import.failed'),
      code: error instanceof VaultError ? error.code : undefined,
    })
  }

  /** Nothing is encrypted before the holder has seen, corrected or dropped each value. */
  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step.name !== 'review') return
    const fields = new FormData(event.currentTarget)
    let reviewed: ExtractedClaim[]
    try {
      reviewed = step.claims
        .filter((c) => fields.get(`keep-${c.claimId}`) === 'on')
        .map((c) =>
          // The name was matched with the identity as read: it is kept as read, or dropped.
          c.attribute === NAME_ATTRIBUTE
            ? c
            : reviewClaim(c, String(fields.get(`value-${c.claimId}`))),
        )
    } catch {
      setStep({ ...step, error: t('import.review.checkValues') })
      return
    }
    const { source, missing } = step
    try {
      setStep({ name: 'encrypting' })
      for (const claim of reviewed) {
        // A corrected value is the holder's declaration: stored as class A, never as signed.
        const declared = claim.document.provenance.class === 'A'
        await store(claim, declared ? { ...source, provenance: { class: 'A' } } : source)
      }
      setStep({
        name: 'done',
        stored: reviewed,
        missing,
        signed: reviewed.some((c) => c.document.provenance.class === 'B'),
      })
    } catch (error) {
      fail(error)
    }
  }

  const missingLine = (missing: string[]) =>
    missing.length > 0 && (
      <p className="hint">{t('import.review.missing', { list: missing.map(attr).join(', ') })}</p>
    )

  if (step.name === 'review') {
    return (
      <form className="card form" onSubmit={onConfirm}>
        <h3>{t('import.review.title')}</h3>
        <p className="success-line">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
          {t('import.review.nameMatched')}
        </p>
        <p className="hint">{t('import.review.hint')}</p>
        {step.claims.length === 0 && <p>{t('import.review.none')}</p>}
        <div className="review-list">
          {step.claims.map((claim) => {
            const label = t('import.review.value', { name: attr(claim.attribute) })
            const locked = claim.attribute === NAME_ATTRIBUTE
            return (
              <fieldset key={claim.claimId} className="review-item">
                <legend>{attr(claim.attribute)}</legend>
                {claim.value.type === 'boolean' ? (
                  <select
                    name={`value-${claim.claimId}`}
                    defaultValue={rawClaimValue(claim.value)}
                    aria-label={label}
                  >
                    <option value="true">{t('common.yes')}</option>
                    <option value="false">{t('common.no')}</option>
                  </select>
                ) : (
                  <input
                    name={`value-${claim.claimId}`}
                    type={
                      claim.value.type === 'number'
                        ? 'number'
                        : claim.value.type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    step={claim.value.type === 'number' ? 'any' : undefined}
                    defaultValue={rawClaimValue(claim.value)}
                    aria-label={label}
                    readOnly={locked}
                    required
                  />
                )}
                <label className="check">
                  <input type="checkbox" name={`keep-${claim.claimId}`} defaultChecked />
                  {t('import.review.keep')}
                </label>
              </fieldset>
            )
          })}
        </div>
        {missingLine(step.missing)}
        <div className="actions">
          <button type="submit" className="button">
            {t('import.review.confirm')}
          </button>
          <button type="button" className="button quiet" onClick={() => setStep({ name: 'idle' })}>
            {t('common.cancel')}
          </button>
        </div>
        {step.error && (
          <p role="alert" className="error">
            {step.error}
          </p>
        )}
      </form>
    )
  }

  if (step.name === 'done') {
    return (
      <div className="card result" role="status">
        <h3>
          {step.stored.length === 1
            ? t('import.done.one')
            : t('import.done.many', { count: step.stored.length })}
        </h3>
        <ul className="claims">
          {step.stored.map((claim) => (
            <li key={claim.claimId}>
              <span>{attr(claim.attribute)}</span>
              <StatusBadge status={holderStatus(claim.document.provenance.class)} />
              <strong>{formatClaimValue(claim.value, locale)}</strong>
            </li>
          ))}
        </ul>
        {step.signed && <p className="hint">{t('import.done.signed')}</p>}
        {missingLine(step.missing)}
        <div className="actions">
          <Link href="/dashboard" className="button">
            {t('import.done.open')}
          </Link>
          <button type="button" className="button quiet" onClick={() => setStep({ name: 'idle' })}>
            {t('import.done.another')}
          </button>
        </div>
      </div>
    )
  }

  const busyLabel: MessageKey | null =
    step.name === 'reading'
      ? 'import.reading'
      : step.name === 'encrypting'
        ? 'import.encrypting'
        : null

  return (
    <form className="card form" onSubmit={onSubmit}>
      <FilePicker
        name="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        label={t('import.file')}
        hint={t('import.fileHint')}
      />

      <div className="field">
        <strong>{t('import.attributes')}</strong>
        <span className="hint">
          {t('import.attributesHint', { max: MAX_ATTRIBUTES_PER_IMPORT })}
        </span>
        <div className="groups">
          {attributeCategories.map((group) => (
            <fieldset key={group.category} className="field group">
              <legend>{t(`cat.${group.category}`)}</legend>
              <div className="checks-grid">
                {attributesOf(group.category).map((a) =>
                  a.attribute === NAME_ATTRIBUTE ? (
                    <label key={a.attribute} className="check" title={t('import.nameRequired')}>
                      <input type="checkbox" checked disabled readOnly />
                      <span>
                        {attr(a.attribute)}
                        <span className="check-note">{t('import.nameRequired')}</span>
                      </span>
                    </label>
                  ) : (
                    <label key={a.attribute} className="check">
                      <input
                        type="checkbox"
                        name="attributes"
                        value={a.attribute}
                        defaultChecked={group.category === 'identity'}
                      />
                      {attr(a.attribute)}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      <label className="check consent">
        <input type="checkbox" name="consent" />
        <span>{t('import.consent')}</span>
      </label>

      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          {busyLabel && <span className="spinner" aria-hidden="true" />}
          {busyLabel ? t(busyLabel) : t('import.submit')}
        </button>
      </div>
      {step.name === 'error' && (
        <p role="alert" className="error">
          {te(step.message)}{' '}
          {step.code === 'SIGNED_OUT' && (
            <Link href="/login?next=/import">{t('import.signInAgain')}</Link>
          )}
        </p>
      )}
    </form>
  )
}
