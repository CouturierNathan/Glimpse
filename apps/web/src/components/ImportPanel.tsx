'use client'

import type { DocumentReference, DocumentUploadRequest, ExtractedClaim } from '@glimpse/shared'
import { generateOpaqueId } from '@glimpse/vault'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'

import {
  attributeCategories,
  attributeName,
  attributesOf,
  documentKinds,
  type DocumentKind,
  MAX_ATTRIBUTES_PER_IMPORT,
  uploadMediaType,
} from '@/lib/vault/attributes.ts'
import { formatClaimValue } from '@/lib/format.ts'
import { rawClaimValue, reviewClaim } from '@/lib/vault/review.ts'
import { holderStatus } from '@/lib/status.ts'

import { DemoDocuments } from './DemoDocuments.tsx'
import { FilePicker } from './FilePicker.tsx'
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
  | { name: 'error'; message: string; signedOut: boolean }

export function ImportPanel() {
  const { request, store } = useVault()
  const post = (url: string, init: RequestInit) => request(url, { method: 'POST', ...init })
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const busy = step.name === 'reading' || step.name === 'encrypting'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const file = fields.get('file')
    const attributes = fields.getAll('attributes').map(String)
    // The file control is off screen, so the browser cannot show a validation bubble on it.
    if (!(file instanceof File) || file.size === 0) {
      setStep({ name: 'error', message: 'Choose a document first.', signedOut: false })
      return
    }
    if (attributes.length === 0) {
      setStep({ name: 'error', message: 'Tick at least one attribute to read.', signedOut: false })
      return
    }
    if (attributes.length > MAX_ATTRIBUTES_PER_IMPORT) {
      setStep({
        name: 'error',
        message: `Choose at most ${MAX_ATTRIBUTES_PER_IMPORT} attributes for one document.`,
        signedOut: false,
      })
      return
    }
    const upload: DocumentUploadRequest = {
      schemaVersion: '1.0.0',
      documentId: generateOpaqueId(),
      documentVersion: 1,
      kind: String(fields.get('kind')) as DocumentKind,
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
      message: error instanceof Error ? error.message : 'Import failed, try again.',
      signedOut: error instanceof VaultError && error.code === 'SIGNED_OUT',
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
        .map((c) => reviewClaim(c, String(fields.get(`value-${c.claimId}`))))
    } catch (error) {
      setStep({ ...step, error: error instanceof Error ? error.message : 'Check the values.' })
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

  if (step.name === 'review') {
    return (
      <form className="panel form" onSubmit={onConfirm}>
        <h2>Check what was read</h2>
        <p className="hint">
          Correct a value or untick it before anything is encrypted. A value you change is stored as
          your own declaration, not as read from a signed document.
        </p>
        {step.claims.length === 0 && <p>No requested attribute was found in this document.</p>}
        {step.claims.map((claim) => (
          <fieldset key={claim.claimId} className="field">
            <legend>{attributeName(claim.attribute)}</legend>
            <label className="check">
              <input type="checkbox" name={`keep-${claim.claimId}`} defaultChecked />
              Keep this value
            </label>
            {claim.value.type === 'boolean' ? (
              <select
                name={`value-${claim.claimId}`}
                defaultValue={rawClaimValue(claim.value)}
                aria-label={`${attributeName(claim.attribute)} value`}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
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
                aria-label={`${attributeName(claim.attribute)} value`}
                required
              />
            )}
          </fieldset>
        ))}
        {step.missing.length > 0 && (
          <p className="hint">
            Not found in this document: {step.missing.map(attributeName).join(', ')}.
          </p>
        )}
        <div className="actions">
          <button type="submit" className="button">
            Encrypt and add to my vault
          </button>
          <button type="button" className="button quiet" onClick={() => setStep({ name: 'idle' })}>
            Cancel
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
      <div className="panel import-result" role="status">
        <h2>
          {step.stored.length === 1
            ? '1 attribute added to your vault'
            : `${step.stored.length} attributes added to your vault`}
        </h2>
        <ul className="claims">
          {step.stored.map((claim) => (
            <li key={claim.claimId}>
              <span>{attributeName(claim.attribute)}</span>
              <StatusBadge status={holderStatus(claim.document.provenance.class)} />
              <strong>{formatClaimValue(claim.value)}</strong>
            </li>
          ))}
        </ul>
        {step.signed && (
          <p className="hint">
            The document&apos;s signature was verified against a trusted authority: the values you
            kept unchanged are marked as coming from a signed document.
          </p>
        )}
        {step.missing.length > 0 && (
          <p className="hint">
            Not found in this document: {step.missing.map(attributeName).join(', ')}.
          </p>
        )}
        <div className="actions">
          <Link href="/dashboard" className="button">
            Open your vault
          </Link>
          <button type="button" className="button quiet" onClick={() => setStep({ name: 'idle' })}>
            Import another document
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="panel form" onSubmit={onSubmit}>
      <DemoDocuments />

      <FilePicker
        name="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        label="Document"
        hint="A PDF or a text file, up to 5 MB. Identity documents are refused here: they go through the identity check on this page."
      />

      <div className="field">
        <label htmlFor="kind">Type of document</label>
        <select id="kind" name="kind" defaultValue="synthetic">
          {documentKinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <strong>Attributes to read</strong>
        <span className="hint">
          Only the ones you tick are read, and at most {MAX_ATTRIBUTES_PER_IMPORT} per document.
          Anything else in the file is ignored.
        </span>
        <div className="groups">
          {attributeCategories.map((group) => (
            <fieldset key={group.category} className="field group">
              <legend>{group.name}</legend>
              <div className="checks-grid">
                {attributesOf(group.category).map((a) => (
                  <label key={a.attribute} className="check">
                    <input
                      type="checkbox"
                      name="attributes"
                      value={a.attribute}
                      defaultChecked={
                        group.category === 'identity' || group.category === 'education'
                      }
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      <label className="check consent">
        <input type="checkbox" name="consent" required />
        <span>
          Glimpse may read this document on its server to extract the attributes above. The text is
          not stored, and each value is encrypted in this browser before it is saved.
        </span>
      </label>

      <button type="submit" className="button" disabled={busy}>
        {step.name === 'reading'
          ? 'Reading the document…'
          : step.name === 'encrypting'
            ? 'Encrypting in your browser…'
            : 'Extract'}
      </button>
      {step.name === 'error' && (
        <p role="alert" className="error">
          {step.message} {step.signedOut && <Link href="/login?next=/import">Sign in</Link>}
        </p>
      )}
    </form>
  )
}
