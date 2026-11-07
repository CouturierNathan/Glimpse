import {
  assertClaimProvenance,
  envelopeLabel,
  parseContract,
  recordAdditionalData,
} from '@glimpse/shared'
import type {
  DocumentReference,
  EncryptedRecord,
  ExtractedClaim,
  KeyEnvelope,
  OpaqueId,
  AttestationRecord,
  ShareGrant,
} from '@glimpse/shared'

export interface PublicRecipient {
  recipientId: OpaqueId
  recipientKeyId: OpaqueId
  publicKey: CryptoKey
}
export interface PrivateRecipient {
  recipientId: OpaqueId
  recipientKeyId: OpaqueId
  privateKey: CryptoKey
}
export type EncryptionIdentity = PublicRecipient & PrivateRecipient
export interface EncryptOptions {
  itemId: OpaqueId
  itemVersion: number
  /** Opaque holder-envelope reference; not proof of consent or authorization. */
  grantId: OpaqueId
}
export type EnvelopeExpectation = Pick<KeyEnvelope, 'itemId' | 'itemVersion' | 'keyId' | 'grantId'>
export type ItemExpectation = EnvelopeExpectation & Pick<EncryptedRecord, 'sourceClass'>
export interface EncryptedItem {
  record: EncryptedRecord
  envelope: KeyEnvelope
}
function cryptoApi(): Crypto {
  const api = globalThis.crypto
  if (!api?.subtle) throw new Error('Web Crypto requires a secure context')
  return api
}
/** Random opaque ID, unrelated to wallet signatures or personal data. */
export function generateOpaqueId(): OpaqueId {
  return Array.from(cryptoApi().getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
function assertId(id: string): void {
  if (!/^[0-9a-f]{32}$/.test(id)) throw new TypeError('Invalid opaque identifier')
}
/** A separate, ephemeral encryption identity. Never derive it from an Ethereum signing key. */
export async function generateEncryptionKeys(recipientId: OpaqueId): Promise<EncryptionIdentity> {
  assertId(recipientId)
  const keys = await cryptoApi().subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['wrapKey', 'unwrapKey'],
  )
  return {
    recipientId,
    recipientKeyId: generateOpaqueId(),
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  }
}
function assertRsaKey(key: CryptoKey, type: 'public' | 'private', usage: KeyUsage): void {
  const algorithm = key.algorithm as RsaHashedKeyAlgorithm
  if (
    key.type !== type ||
    algorithm.name !== 'RSA-OAEP' ||
    algorithm.hash?.name !== 'SHA-256' ||
    algorithm.modulusLength < 2048 ||
    !key.usages.includes(usage) ||
    (type === 'private' && key.extractable)
  ) {
    throw new TypeError('Unsupported encryption key')
  }
}
function encode(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // Chunked conversion avoids argument limits for large payloads, without Node Buffer.
  let binary = ''
  for (let i = 0; i < view.length; i += 8192) {
    binary += String.fromCharCode(...view.subarray(i, i + 8192))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decode(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4),
  )
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}
// Shared binding helpers accept full records. These public zero-byte placeholders exist only
// to validate the metadata before encryption; they are never keys or output ciphertext.
function recordHeader(
  options: EncryptOptions,
  sourceClass: EncryptedRecord['sourceClass'],
): EncryptedRecord {
  return parseContract('EncryptedRecord', {
    schemaVersion: '1.0.0',
    itemId: options.itemId,
    itemVersion: options.itemVersion,
    keyId: generateOpaqueId(),
    sourceClass,
    algorithm: 'A256GCM',
    ciphertext: encode(new Uint8Array(16)),
    iv: encode(cryptoApi().getRandomValues(new Uint8Array(12))),
    aadVersion: '1',
  })
}
/** Encrypt exactly one shareable attribute; only encrypted wire objects leave this function. */
export async function encryptItem(
  input: unknown,
  trustedSource: DocumentReference,
  recipient: PublicRecipient,
  options: EncryptOptions,
): Promise<EncryptedItem> {
  const claim = parseContract('ExtractedClaim', input)
  assertClaimProvenance(claim, trustedSource)
  return encryptPayload(claim, claim.document.provenance.class, recipient, options)
}
/** C owns signature verification; this preserves the entire signed record inside ciphertext. */
export async function encryptAttestation(
  input: unknown,
  recipient: PublicRecipient,
  options: EncryptOptions,
): Promise<EncryptedItem> {
  return encryptPayload(parseContract('AttestationRecord', input), 'C', recipient, options)
}
async function encryptPayload(
  claim: ExtractedClaim | AttestationRecord,
  sourceClass: EncryptedRecord['sourceClass'],
  recipient: PublicRecipient,
  options: EncryptOptions,
): Promise<EncryptedItem> {
  const holder = { ...recipient }
  assertRsaKey(holder.publicKey, 'public', 'wrapKey')
  const record = recordHeader(options, sourceClass)
  const envelope = parseContract('KeyEnvelope', {
    schemaVersion: '1.0.0',
    envelopeId: generateOpaqueId(),
    itemId: record.itemId,
    itemVersion: record.itemVersion,
    keyId: record.keyId,
    recipientId: holder.recipientId,
    recipientKeyId: holder.recipientKeyId,
    grantId: options.grantId,
    algorithm: 'RSA-OAEP-256',
    wrappedKey: encode(
      new Uint8Array((holder.publicKey.algorithm as RsaHashedKeyAlgorithm).modulusLength / 8),
    ),
    labelVersion: '1',
  })
  const api = cryptoApi().subtle
  // Extractability is needed only for wrapKey. This key is never returned or exported as raw bytes.
  const itemKey = await api.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
  const plaintext = new TextEncoder().encode(JSON.stringify(claim))
  try {
    const ciphertext = await api.encrypt(
      {
        name: 'AES-GCM',
        iv: decode(record.iv),
        additionalData: new Uint8Array(recordAdditionalData(record)),
        tagLength: 128,
      },
      itemKey,
      plaintext,
    )
    const wrappedKey = await api.wrapKey('raw', itemKey, holder.publicKey, {
      name: 'RSA-OAEP',
      label: new Uint8Array(envelopeLabel(envelope)),
    })
    return {
      record: parseContract('EncryptedRecord', { ...record, ciphertext: encode(ciphertext) }),
      envelope: parseContract('KeyEnvelope', { ...envelope, wrappedKey: encode(wrappedKey) }),
    }
  } finally {
    plaintext.fill(0)
  }
}
function assertEnvelopeContext(
  envelope: KeyEnvelope,
  holder: PrivateRecipient,
  expected: EnvelopeExpectation,
): void {
  if (
    envelope.recipientId !== holder.recipientId ||
    envelope.recipientKeyId !== holder.recipientKeyId ||
    envelope.itemId !== expected.itemId ||
    envelope.itemVersion !== expected.itemVersion ||
    envelope.keyId !== expected.keyId ||
    envelope.grantId !== expected.grantId
  ) {
    throw new Error('Envelope context mismatch')
  }
}
/** Unwrap in client memory into a non-exportable AES key. Expected context must be trusted. */
export async function openEnvelope(
  input: unknown,
  recipient: PrivateRecipient,
  expected: EnvelopeExpectation,
): Promise<CryptoKey> {
  return unwrapEnvelope(input, recipient, expected, false)
}
async function unwrapEnvelope(
  input: unknown,
  recipient: PrivateRecipient,
  expected: EnvelopeExpectation,
  extractable: boolean,
): Promise<CryptoKey> {
  const envelope = parseContract('KeyEnvelope', input)
  const holder = { ...recipient }
  assertRsaKey(holder.privateKey, 'private', 'unwrapKey')
  assertEnvelopeContext(envelope, holder, expected)
  const wrapped = decode(envelope.wrappedKey)
  if (
    wrapped.byteLength !==
    (holder.privateKey.algorithm as RsaHashedKeyAlgorithm).modulusLength / 8
  ) {
    throw new TypeError('Invalid wrapped key length')
  }
  const key = await cryptoApi().subtle.unwrapKey(
    'raw',
    wrapped,
    holder.privateKey,
    { name: 'RSA-OAEP', label: new Uint8Array(envelopeLabel(envelope)) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['decrypt'],
  )
  if ((key.algorithm as AesKeyAlgorithm).length !== 256) {
    throw new TypeError('Invalid item key length')
  }
  return key
}
/** Authenticate both layers before returning validated claim plaintext. No authorization implied. */
export async function decryptItem(
  recordInput: unknown,
  envelopeInput: unknown,
  recipient: PrivateRecipient,
  expected: ItemExpectation,
): Promise<ExtractedClaim> {
  const value = await decryptPayload(recordInput, envelopeInput, recipient, expected)
  const claim = parseContract('ExtractedClaim', value)
  if (claim.document.provenance.class !== expected.sourceClass)
    throw new Error('Source class mismatch')
  return claim
}
export async function decryptAttestation(
  recordInput: unknown,
  envelopeInput: unknown,
  recipient: PrivateRecipient,
  expected: ItemExpectation,
): Promise<AttestationRecord> {
  if (expected.sourceClass !== 'C') throw new Error('Source class mismatch')
  return parseContract(
    'AttestationRecord',
    await decryptPayload(recordInput, envelopeInput, recipient, expected),
  )
}
async function decryptPayload(
  recordInput: unknown,
  envelopeInput: unknown,
  recipient: PrivateRecipient,
  expected: ItemExpectation,
): Promise<unknown> {
  const record = parseContract('EncryptedRecord', recordInput)
  const context = { ...expected }
  if (
    record.itemId !== context.itemId ||
    record.itemVersion !== context.itemVersion ||
    record.keyId !== context.keyId ||
    record.sourceClass !== context.sourceClass
  ) {
    throw new Error('Item context mismatch')
  }
  const key = await openEnvelope(envelopeInput, recipient, context)
  const plaintext = new Uint8Array(
    await cryptoApi().subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decode(record.iv),
        additionalData: new Uint8Array(recordAdditionalData(record)),
        tagLength: 128,
      },
      key,
      decode(record.ciphertext),
    ),
  )
  try {
    let value: unknown
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
    } catch {
      throw new TypeError('Invalid encrypted claim payload')
    }
    return value
  } finally {
    plaintext.fill(0)
  }
}

/** Client operation after server consent authorization. Does not export raw/private keys. */
export async function wrapForRequester(
  recordInput: unknown,
  ownerEnvelope: unknown,
  holder: PrivateRecipient,
  expected: ItemExpectation,
  grantInput: unknown,
  recipient: PublicRecipient,
): Promise<KeyEnvelope> {
  const grant = parseContract('ShareGrant', grantInput)
  const record = parseContract('EncryptedRecord', recordInput)
  assertLiveGrant(grant)
  if (
    grant.holderId !== holder.recipientId ||
    grant.recipientId !== recipient.recipientId ||
    grant.itemId !== record.itemId ||
    grant.itemVersion !== record.itemVersion
  )
    throw new Error('Grant binding mismatch')
  assertRsaKey(recipient.publicKey, 'public', 'wrapKey')
  // Authenticate the ciphertext before rewrapping, then retain extractability only in this scope.
  await decryptPayload(record, ownerEnvelope, holder, expected)
  const key = await unwrapEnvelope(ownerEnvelope, holder, expected, true)
  const envelope = parseContract('KeyEnvelope', {
    schemaVersion: '1.0.0',
    envelopeId: generateOpaqueId(),
    itemId: record.itemId,
    itemVersion: record.itemVersion,
    keyId: record.keyId,
    recipientId: recipient.recipientId,
    recipientKeyId: recipient.recipientKeyId,
    grantId: grant.grantId,
    algorithm: 'RSA-OAEP-256',
    wrappedKey: encode(
      new Uint8Array((recipient.publicKey.algorithm as RsaHashedKeyAlgorithm).modulusLength / 8),
    ),
    labelVersion: '1',
  })
  const wrappedKey = await cryptoApi().subtle.wrapKey('raw', key, recipient.publicKey, {
    name: 'RSA-OAEP',
    label: new Uint8Array(envelopeLabel(envelope)),
  })
  assertLiveGrant(grant)
  return parseContract('KeyEnvelope', { ...envelope, wrappedKey: encode(wrappedKey) })
}
export function assertLiveGrant(grant: ShareGrant, now = Date.now()): void {
  if (
    grant.revocation.status !== 'active' ||
    now < Date.parse(grant.createdAt) ||
    now >= Date.parse(grant.expiresAt)
  )
    throw new Error('Grant inactive')
}
