/** Random 128-bit ID encoded as 32 lowercase hex characters. Never derive from PII. */
export type OpaqueId = string
/** Canonical unpadded RFC4648 base64url. */
export type Base64Url = string
export type SourceClass = 'A' | 'B' | 'C'
export type Provenance =
  | { class: 'A' }
  | { class: 'B'; signatureVerificationId: OpaqueId }
  | { class: 'C'; attestationId: OpaqueId; issuerId: OpaqueId }
export interface DocumentReference {
  documentId: OpaqueId
  documentVersion: number
  provenance: Provenance
}
export type ClaimValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }
/** Sensitive plaintext: encrypt the entire claim before storage. Dates are YYYY-MM-DD. */
export interface ExtractedClaim {
  schemaVersion: '1.0.0'
  claimId: OpaqueId
  attribute: string
  value: ClaimValue
  period: { start: string; end: string }
  document: DocumentReference
  pages: number[]
  confidence: number
}
export interface EncryptedRecord {
  schemaVersion: '1.0.0'
  itemId: OpaqueId
  itemVersion: number
  keyId: OpaqueId
  sourceClass: SourceClass
  algorithm: 'A256GCM'
  /** Ciphertext followed by the 16-byte authentication tag. */
  ciphertext: Base64Url
  /** 12 random bytes; never reuse with the same key. */
  iv: Base64Url
  aadVersion: '1'
}
export interface KeyEnvelope {
  schemaVersion: '1.0.0'
  envelopeId: OpaqueId
  itemId: OpaqueId
  itemVersion: number
  keyId: OpaqueId
  recipientId: OpaqueId
  recipientKeyId: OpaqueId
  grantId: OpaqueId
  algorithm: 'RSA-OAEP-256'
  /** RSA >=2048, SHA-256/MGF1-SHA-256 wrapping a random 32-byte item key. */
  wrappedKey: Base64Url
  labelVersion: '1'
}
/** Timestamps are UTC YYYY-MM-DDTHH:mm:ss.sssZ. */
export interface ShareGrant {
  schemaVersion: '1.0.0'
  grantId: OpaqueId
  itemId: OpaqueId
  itemVersion: number
  holderId: OpaqueId
  recipientId: OpaqueId
  consentRequestId: OpaqueId
  createdAt: string
  expiresAt: string
  revocation: { status: 'active' } | { status: 'revoked'; revokedAt: string }
}
export interface DataContracts {
  ExtractedClaim: ExtractedClaim
  EncryptedRecord: EncryptedRecord
  KeyEnvelope: KeyEnvelope
  ShareGrant: ShareGrant
}
