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
/** EVM address, 0x + 40 hex (any case). */
export type Address = string
/** 0x + lowercase hex, as EVM tools print it. */
export type Hex = string
/**
 * Organisation-signed attestation (source class C), held encrypted in the holder's vault.
 * Only attestationId, issuerId, commitment and the validity times go on chain; the rest is sensitive.
 * commitment = keccak256(abi.encode(bytes32 salt, bytes16 attestationId, address holder,
 * string attribute, string value.type, string JSON.stringify(value.value))).
 * The issuer signs the EIP-712 struct Attestation(bytes16 attestationId, bytes16 issuerId,
 * bytes32 commitment, uint64 issuedAt, uint64 expiresAt) in the domain
 * { name: 'Glimpse', version: '1', chainId, verifyingContract }. Times are whole seconds.
 */
export interface AttestationRecord {
  schemaVersion: '1.0.0'
  attestationId: OpaqueId
  issuerId: OpaqueId
  /** Wallet address of the holder: a pseudonym, hidden on chain by the commitment. */
  holder: Address
  attribute: string
  value: ClaimValue
  issuedAt: string
  expiresAt: string
  /** 32 random bytes; never reused. */
  salt: Hex
  commitment: Hex
  proof: { type: 'EIP712'; chainId: number; verifyingContract: Address; signature: Hex }
}
/** AttestationRegistry.statusOf, read live from chain; never stored in the record. */
export type RevocationStatus = 'unknown' | 'active' | 'expired' | 'revoked'
/**
 * One IssuerRegistry entry (getIssuer), public. Registration is open and grants no trust:
 * each requester keeps its own list of the issuerIds it accepts.
 */
export interface IssuerRegistryEntry {
  schemaVersion: '1.0.0'
  issuerId: OpaqueId
  /** Manages the entry and rotates the signer. */
  admin: Address
  /** Current attestation signing key; an attestation is checked against the signer anchored with it. */
  signer: Address
  /** Public organisation metadata (name, website); never holder data. */
  metadataURI: string
  chainId: number
  /** IssuerRegistry contract the entry was read from. */
  registry: Address
}
/**
 * Signed by the requester's key over the EIP-712 struct VerificationRequest(bytes16 requestId,
 * address requester, string attribute, string purpose, bytes16 recipientId, bytes16 recipientKeyId,
 * uint64 createdAt, uint64 expiresAt) in the domain { name: 'Glimpse', version: '1', chainId }.
 * requestId is the nonce: random, answered once. Times are whole seconds.
 */
export interface VerificationRequest {
  schemaVersion: '1.0.0'
  requestId: OpaqueId
  requester: Address
  attribute: string
  /** Shown to the holder before consent. */
  purpose: string
  /** Who receives the item: the key envelope is wrapped for this recipient key. */
  recipientId: OpaqueId
  recipientKeyId: OpaqueId
  createdAt: string
  expiresAt: string
  proof: { type: 'EIP712'; chainId: number; signature: Hex }
}
export type CheckOutcome = 'pass' | 'fail' | 'unknown'
/** Computed by the requester's own verifier from the chain, never taken from a Glimpse server. */
export interface VerificationResult {
  schemaVersion: '1.0.0'
  requestId: OpaqueId
  /** Both absent when the shared item is a declaration (class A or B), not an attestation. */
  attestationId?: OpaqueId
  issuerId?: OpaqueId
  verdict: 'authentic' | 'declared' | 'expired' | 'revoked' | 'undetermined'
  checks: {
    signature: CheckOutcome
    provenance: CheckOutcome
    integrity: CheckOutcome
    validity: CheckOutcome
    revocation: CheckOutcome
    replay: CheckOutcome
  }
  /** The requester's own trust policy for this issuer, separate from authenticity. */
  issuerTrusted: boolean
  checkedAt: string
}
/** Pole A. The SIWE-authenticated wallet behind a session cookie; the app chain is fixed. */
export interface AuthSession {
  schemaVersion: '1.0.0'
  address: Address
  chainId: number
  issuedAt: string
  expiresAt: string
}
/**
 * Pole A. What the holder asks to extract from one uploaded document; the file travels beside it.
 * Identity proofs are not uploads: they go through the identity check, never the extractor.
 */
export interface DocumentUploadRequest {
  schemaVersion: '1.0.0'
  documentId: OpaqueId
  documentVersion: number
  kind: 'synthetic' | 'education' | 'employment'
  mediaType: 'application/pdf' | 'text/plain'
  /** The attributes the holder consents to extract, nothing else is read. */
  attributes: string[]
}
/**
 * Pole A. The holder's answer to one VerificationRequest (consentRequestId is its requestId).
 * Allow names exactly one item version and needs decidedAt < expiresAt; deny carries a reason.
 * B maps an allow to its ConsentDecision and creates the grant from it, so no grantId here.
 */
export interface AccessDecision {
  schemaVersion: '1.0.0'
  outcome: 'allow' | 'deny'
  holderId: OpaqueId
  consentRequestId: OpaqueId
  recipientId: OpaqueId
  recipientKeyId: OpaqueId
  /** Allow only. */
  itemId?: OpaqueId
  itemVersion?: number
  /** Deny only. */
  reason?: 'holder-refused' | 'consent-withdrawn' | 'request-expired'
  decidedAt: string
  /** End of the consent: the request's own expiry. */
  expiresAt: string
}
/**
 * Pole A. Result of checking a PAdES-signed PDF (a France Identité proof), with DSS's indications
 * so a DSS service can produce it instead. It covers the signed document only: it never proves
 * that whoever presents it is the person it names. TOTAL_PASSED needs every check to pass, a
 * signer and the trust anchor reached; any other indication needs a subIndication.
 */
export interface IdentityValidationReport {
  schemaVersion: '1.0.0'
  reportId: OpaqueId
  validator: 'glimpse-pades' | 'dss'
  /** SHA-256 of the whole PDF. Private: never on chain. */
  documentDigest: Hex
  indication: 'TOTAL_PASSED' | 'TOTAL_FAILED' | 'INDETERMINATE'
  subIndication?:
    | 'FORMAT_FAILURE'
    | 'HASH_FAILURE'
    | 'SIG_CRYPTO_FAILURE'
    | 'NO_SIGNING_CERTIFICATE_FOUND'
    | 'NO_CERTIFICATE_CHAIN_FOUND'
    | 'OUT_OF_BOUNDS_NO_POE'
    | 'NOT_YET_VALID'
  checks: {
    format: CheckOutcome
    integrity: CheckOutcome
    signature: CheckOutcome
    chain: CheckOutcome
    validity: CheckOutcome
  }
  signer?: {
    subject: string
    issuer: string
    /** Lowercase hex. */
    serialNumber: string
    notBefore: string
    notAfter: string
  }
  /** The signing time the signer claims; not a proof of existence without a timestamp. */
  signingTime?: string
  /** SHA-256 of the DER trust anchor certificate the chain ends at. */
  trustAnchor?: Hex
  validatedAt: string
}
export interface DataContracts {
  ExtractedClaim: ExtractedClaim
  EncryptedRecord: EncryptedRecord
  KeyEnvelope: KeyEnvelope
  ShareGrant: ShareGrant
  AttestationRecord: AttestationRecord
  IssuerRegistryEntry: IssuerRegistryEntry
  VerificationRequest: VerificationRequest
  VerificationResult: VerificationResult
  AuthSession: AuthSession
  DocumentUploadRequest: DocumentUploadRequest
  AccessDecision: AccessDecision
  IdentityValidationReport: IdentityValidationReport
}
