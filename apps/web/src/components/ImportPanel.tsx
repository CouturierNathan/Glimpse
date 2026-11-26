'use client'

import type {
  AttestationRecord,
  DocumentReference,
  DocumentUploadRequest,
  ExtractedClaim,
} from '@glimpse/shared'
import { generateOpaqueId } from '@glimpse/vault'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import type { Address } from 'viem'

import { anchorStatus } from '@/lib/attestation-check.ts'
import { appChain, attestationRegistry } from '@/lib/chains.ts'
import { formatClaimValue } from '@/lib/format.ts'
import type { MessageKey } from '@/lib/i18n/messages.ts'
import { readAttestationFile } from '@/lib/issuer.ts'
import { holderStatus } from '@/lib/status.ts'
import {
  attributeCategories,
  attributesOf,
  IMPORT_DOCUMENT_KIND,
  importAttributes,
  MAX_ATTRIBUTES_PER_IMPORT,
  NAME_ATTRIBUTE,
  uploadMediaType,
} from '@/lib/vault/attributes.ts'
import { rawClaimValue, reviewClaim } from '@/lib/vault/review.ts'

import { FilePicker } from './FilePicker.tsx'
import { ErrorNotice, FieldError, Notice, useFieldErrors } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { Select } from './Select.tsx'
import { useSession } from './SessionProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { useVault, VaultError } from './VaultProvider.tsx'

/** What the chosen file is, read from its name and type: no question asked of the holder. */
type FileKind = 'document' | 'attestation'

function kindOf(file: File): FileKind {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')
    ? 'attestation'
    : 'document'
}

interface Stored {
  attribute: string
  sourceClass: 'A' | 'B' | 'C'
  value: ExtractedClaim['value']
}

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
  | { name: 'done'; stored: Stored[]; missing: string[]; signed: boolean; attestation: boolean }
  | { name: 'error'; message: string; code?: string }

/**
 * One entry point for everything the holder adds. A PDF or text document is read on the server
 * (the ticked information only) and must name the verified holder; an organisation's attestation
 * file is checked in this browser — addressed to this wallet, on this network, recorded on chain
 * and not revoked. Either way, every value is encrypted here before it is stored.
 */

/** Everything the holder can tick: the name is always read, so it is not one of them. */
const optional = importAttributes.filter((a) => a.attribute !== NAME_ATTRIBUTE)

export function ImportPanel() {
  const { request, store, storeAttestation } = useVault()
  const { address } = useSession()
  const { t, attr, locale } = useI18n()
  const fields = useFieldErrors()
  const post = (url: string, init: RequestInit) => request(url, { method: 'POST', ...init })
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const [kind, setKind] = useState<FileKind | null>(null)
  // Everything is ticked to start with: a document answers for what it holds and stays silent on
  // the rest, so asking for all of it costs the holder nothing.
  const [selected, setSelected] = useState<string[]>(() => optional.map((a) => a.attribute))
  const busy = step.name === 'reading' || step.name === 'encrypting'
  const allSelected = selected.length === optional.length

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('file')
    const chosen = file instanceof File && file.size > 0 ? file : null
    const fileKind = chosen ? kindOf(chosen) : null
    // The name is always read: the server matches it with the verified identity.
    const attributes = [NAME_ATTRIBUTE, ...selected]
    const ok = fields.report(
      {
        file: chosen ? undefined : t('import.chooseFirst'),
        attributes:
          fileKind === 'document' && attributes.length > MAX_ATTRIBUTES_PER_IMPORT
            ? t('import.tooMany', { max: MAX_ATTRIBUTES_PER_IMPORT })
            : undefined,
        consent:
          fileKind === 'document' && data.get('consent') !== 'on'
            ? t('import.consentRequired')
            : undefined,
      },
      form,
    )
    if (!ok || !chosen) return
    if (fileKind === 'attestation') await importAttestation(chosen)
    else await importDocument(chosen, attributes)
  }

  async function importAttestation(file: File) {
    if (!address) return
    setStep({ name: 'reading' })
    try {
      let record: AttestationRecord
      try {
        record = readAttestationFile(await file.text(), {
          holder: address as Address,
          chainId: appChain.id,
          attestationRegistry,
        })
      } catch (error) {
        setStep({
          name: 'error',
          message: error instanceof Error ? error.message : t('attestation.error'),
        })
        return
      }
      const onChain = await anchorStatus(record)
      if (onChain === 'missing' || onChain === 'revoked') {
        setStep({
          name: 'error',
          message: t(onChain === 'missing' ? 'attestation.missing' : 'attestation.revoked'),
        })
        return
      }
      setStep({ name: 'encrypting' })
      await storeAttestation(record)
      setStep({
        name: 'done',
        stored: [{ attribute: record.attribute, sourceClass: 'C', value: record.value }],
        missing: [],
        signed: false,
        attestation: true,
      })
    } catch (error) {
      fail(error)
    }
  }

  async function importDocument(file: File, attributes: string[]) {
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
    const data = new FormData(event.currentTarget)
    let reviewed: ExtractedClaim[]
    try {
      reviewed = step.claims
        .filter((c) => data.get(`keep-${c.claimId}`) === 'on')
        .map((c) =>
          // The name was matched with the identity as read: it is kept as read, or dropped.
          c.attribute === NAME_ATTRIBUTE
            ? c
            : reviewClaim(c, String(data.get(`value-${c.claimId}`))),
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
        stored: reviewed.map((c) => ({
          attribute: c.attribute,
          sourceClass: c.document.provenance.class,
          value: c.value,
        })),
        missing,
        signed: reviewed.some((c) => c.document.provenance.class === 'B'),
        attestation: false,
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
      <form className="card form" onSubmit={onConfirm} noValidate>
        <h3>{t('import.review.title')}</h3>
        <Notice tone="success">{t('import.review.nameMatched')}</Notice>
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
                  <Select
                    name={`value-${claim.claimId}`}
                    defaultValue={rawClaimValue(claim.value)}
                    aria-label={label}
                    options={[
                      { value: 'true', label: t('common.yes') },
                      { value: 'false', label: t('common.no') },
                    ]}
                  />
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
        <ErrorNotice message={step.error ?? null} />
      </form>
    )
  }

  if (step.name === 'done') {
    return (
      <div className="card result" role="status">
        <Notice
          tone="success"
          title={
            step.stored.length === 1
              ? t('import.done.one')
              : t('import.done.many', { count: step.stored.length })
          }
        />
        <ul className="claims">
          {step.stored.map((item) => (
            <li key={item.attribute}>
              <span>{attr(item.attribute)}</span>
              <StatusBadge status={holderStatus(item.sourceClass)} />
              <strong>{formatClaimValue(item.value, locale)}</strong>
            </li>
          ))}
        </ul>
        {step.signed && <p className="hint">{t('import.done.signed')}</p>}
        {step.attestation && <p className="hint">{t('import.done.attestation')}</p>}
        {missingLine(step.missing)}
        <div className="actions">
          <Link href="/dashboard" className="button">
            {t('import.done.open')}
          </Link>
          <button
            type="button"
            className="button quiet"
            onClick={() => {
              setKind(null)
              setStep({ name: 'idle' })
            }}
          >
            {t('import.done.another')}
          </button>
        </div>
      </div>
    )
  }

  const busyLabel: MessageKey | null =
    step.name === 'reading'
      ? kind === 'attestation'
        ? 'import.checkingAttestation'
        : 'import.reading'
      : step.name === 'encrypting'
        ? 'import.encrypting'
        : null

  return (
    <form className="card form" onSubmit={onSubmit} noValidate>
      <FilePicker
        name="file"
        accept=".pdf,.txt,.json,application/pdf,text/plain,application/json"
        label={t('import.file')}
        hint={t('import.fileHint')}
        error={fields.errors.file}
        onSelect={(file) => {
          setKind(file ? kindOf(file) : null)
          fields.clear('file')
          if (step.name === 'error') setStep({ name: 'idle' })
        }}
      />

      {kind === 'attestation' && (
        <Notice tone="info" title={t('import.kind.attestation')}>
          {t('import.kind.attestationText')}
        </Notice>
      )}
      {kind === 'document' && (
        <Notice tone="info" title={t('import.kind.document')}>
          {t('import.kind.documentText')}
        </Notice>
      )}

      {kind !== 'attestation' && (
        <>
          <fieldset className="field" data-invalid={fields.errors.attributes ? '' : undefined}>
            <legend>{t('import.attributes')}</legend>
            <div className="select-all">
              <span className="hint">{t('import.attributesHint')}</span>
              <button
                type="button"
                className="button quiet small"
                onClick={() => {
                  setSelected(allSelected ? [] : optional.map((a) => a.attribute))
                  fields.clear('attributes')
                }}
              >
                {allSelected ? t('import.selectNone') : t('import.selectAll')}
              </button>
            </div>
            <div className="groups">
              {attributeCategories.map((group) => (
                <div key={group.category} className="group">
                  <strong>{t(`cat.${group.category}`)}</strong>
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
                            name="info"
                            value={a.attribute}
                            checked={selected.includes(a.attribute)}
                            onChange={(event) => {
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, a.attribute]
                                  : current.filter((name) => name !== a.attribute),
                              )
                              fields.clear('attributes')
                            }}
                            {...(a.attribute === 'date_of_birth'
                              ? { 'data-field': 'attributes' }
                              : {})}
                          />
                          {attr(a.attribute)}
                        </label>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            <FieldError name="info" message={fields.errors.attributes} />
          </fieldset>

          <div className="field">
            <label className="check consent" data-invalid={fields.errors.consent ? '' : undefined}>
              <input
                type="checkbox"
                name="consent"
                {...fields.control('consent')}
                onChange={() => fields.clear('consent')}
              />
              <span>{t('import.consent')}</span>
            </label>
            <FieldError name="consent" message={fields.errors.consent} />
          </div>
        </>
      )}

      <div className="actions">
        <button type="submit" className="button" disabled={busy}>
          {busyLabel && <span className="spinner" aria-hidden="true" />}
          {busyLabel
            ? t(busyLabel)
            : kind === 'attestation'
              ? t('import.submitAttestation')
              : t('import.submit')}
        </button>
      </div>
      {step.name === 'error' && (
        <ErrorNotice
          message={step.message}
          action={
            step.code === 'SIGNED_OUT' ? (
              <Link href="/login?next=/import" className="button quiet small">
                {t('import.signInAgain')}
              </Link>
            ) : undefined
          }
        />
      )}
    </form>
  )
}
