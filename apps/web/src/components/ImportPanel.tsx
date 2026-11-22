'use client'

import type { DocumentReference, DocumentUploadRequest, ExtractedClaim } from '@glimpse/shared'
import { generateOpaqueId } from '@glimpse/vault'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'

import {
  attributeName,
  documentKinds,
  type DocumentKind,
  importAttributes,
  uploadMediaType,
} from '@/lib/vault/attributes.ts'
import { formatClaimValue } from '@/lib/format.ts'
import { holderStatus } from '@/lib/status.ts'

import { StatusBadge } from './StatusBadge.tsx'
import { useVault, VaultError } from './VaultProvider.tsx'

type Step =
  | { name: 'idle' }
  | { name: 'reading' }
  | { name: 'encrypting' }
  | { name: 'done'; stored: ExtractedClaim[]; missing: string[] }
  | { name: 'error'; message: string; signedOut: boolean }

export function ImportPanel() {
  const { request, store } = useVault()
  const post = (url: string, init: RequestInit) => request(url, { method: 'POST', ...init })
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const busy = step.name === 'reading' || step.name === 'encrypting'

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const file = fields.get('file') as File
    const attributes = fields.getAll('attributes').map(String)
    const upload: DocumentUploadRequest = {
      schemaVersion: '1.0.0',
      documentId: generateOpaqueId(),
      documentVersion: 1,
      kind: String(fields.get('kind')) as DocumentKind,
      mediaType: uploadMediaType(file),
      attributes,
    }
    // Set here, before any extraction: an imported document is class A, whatever the model says.
    const source: DocumentReference = {
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
      const { claims } = (await res.json()) as { claims: ExtractedClaim[] }

      setStep({ name: 'encrypting' })
      for (const claim of claims) await store(claim, source)
      const found = new Set(claims.map((c) => c.attribute))
      setStep({
        name: 'done',
        stored: claims,
        missing: attributes.filter((a) => !found.has(a)),
      })
    } catch (error) {
      setStep({
        name: 'error',
        message: error instanceof Error ? error.message : 'Import failed, try again.',
        signedOut: error instanceof VaultError && error.code === 'SIGNED_OUT',
      })
    }
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
      <div className="field">
        <label htmlFor="file">Document</label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          required
        />
        <span className="hint">
          A PDF or a text file, up to 5 MB. Identity documents are refused.
        </span>
      </div>

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

      <fieldset className="field">
        <legend>Attributes to extract</legend>
        {importAttributes.map((a) => (
          <label key={a.attribute} className="check">
            <input type="checkbox" name="attributes" value={a.attribute} defaultChecked />
            {a.name}
          </label>
        ))}
      </fieldset>

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
            : 'Extract and encrypt'}
      </button>
      {step.name === 'error' && (
        <p role="alert" className="error">
          {step.message} {step.signedOut && <Link href="/login?next=/import">Sign in</Link>}
        </p>
      )}
    </form>
  )
}
