import { parseContract } from './validation.ts'
import type {
  DocumentReference,
  EncryptedRecord,
  ExtractedClaim,
  KeyEnvelope,
  ShareGrant,
} from './types.ts'
/** Exact UTF-8 bytes for AES-GCM additionalData. */
export function recordAdditionalData(input: EncryptedRecord): Uint8Array {
  const r = parseContract('EncryptedRecord', input)
  return new TextEncoder().encode(
    JSON.stringify([
      'glimpse.record',
      r.schemaVersion,
      r.aadVersion,
      r.itemId,
      r.itemVersion,
      r.keyId,
      r.sourceClass,
      r.algorithm,
    ]),
  )
}
/** Exact UTF-8 bytes for RSA-OAEP label on both wrap and unwrap. */
export function envelopeLabel(input: KeyEnvelope): Uint8Array {
  const e = parseContract('KeyEnvelope', input)
  return new TextEncoder().encode(
    JSON.stringify([
      'glimpse.envelope',
      e.schemaVersion,
      e.labelVersion,
      e.envelopeId,
      e.itemId,
      e.itemVersion,
      e.keyId,
      e.recipientId,
      e.recipientKeyId,
      e.grantId,
      e.algorithm,
    ]),
  )
}
/** Source must come from the trusted upload/verifier context, never the LLM. */
export function assertClaimProvenance(input: ExtractedClaim, source: DocumentReference): void {
  const c = parseContract('ExtractedClaim', input)
  const t = parseContract('ExtractedClaim', { ...c, document: source }).document
  const a = c.document
  if (
    a.documentId !== t.documentId ||
    a.documentVersion !== t.documentVersion ||
    a.provenance.class !== t.provenance.class
  ) {
    throw new TypeError('Provenance mismatch')
  }
  if (
    a.provenance.class === 'B' &&
    t.provenance.class === 'B' &&
    a.provenance.signatureVerificationId !== t.provenance.signatureVerificationId
  ) {
    throw new TypeError('Signature evidence mismatch')
  }
  if (
    a.provenance.class === 'C' &&
    t.provenance.class === 'C' &&
    (a.provenance.attestationId !== t.provenance.attestationId ||
      a.provenance.issuerId !== t.provenance.issuerId)
  ) {
    throw new TypeError('Attestation evidence mismatch')
  }
}
/** Coherence only: A's AccessDecision must still authorize each use. */
export function assertShareBinding(
  record: EncryptedRecord,
  envelope: KeyEnvelope,
  grant: ShareGrant,
): void {
  const r = parseContract('EncryptedRecord', record)
  const e = parseContract('KeyEnvelope', envelope)
  const g = parseContract('ShareGrant', grant)
  if (
    r.itemId !== e.itemId ||
    r.itemVersion !== e.itemVersion ||
    r.keyId !== e.keyId ||
    g.itemId !== e.itemId ||
    g.itemVersion !== e.itemVersion ||
    g.grantId !== e.grantId ||
    g.recipientId !== e.recipientId
  ) {
    throw new TypeError('Share binding mismatch')
  }
}
