import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webcrypto } from 'node:crypto'
import {
  fixtures,
  schemas,
  parseContract,
  isContract,
  recordAdditionalData,
  envelopeLabel,
  assertClaimProvenance,
  assertShareBinding,
} from '@glimpse/shared'
import type { ContractName, ClaimValue, Provenance } from '@glimpse/shared'

const names = Object.keys(schemas) as ContractName[]
const id = 'f'.repeat(32)
const claim = () => parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
const record = () => parseContract('EncryptedRecord', fixtures.valid.EncryptedRecord)
const envelope = () => parseContract('KeyEnvelope', fixtures.valid.KeyEnvelope)
const grant = () => parseContract('ShareGrant', fixtures.valid.ShareGrant)
for (const name of names) {
  test(`${name}: fixtures conform and unknown metadata fails closed`, () => {
    assert.ok(isContract(name, fixtures.valid[name]))
    assert.deepEqual(parseContract(name, fixtures.valid[name]), fixtures.valid[name])
    assert.throws(() => parseContract(name, fixtures.invalid[name]))
    for (const key of schemas[name].required) {
      const missing = { ...fixtures.valid[name] } as Record<string, unknown>
      Reflect.deleteProperty(missing, key)
      assert.throws(() => parseContract(name, missing), TypeError, key)
    }
    assert.throws(() => parseContract(name, { ...fixtures.valid[name], schemaVersion: '2.0.0' }))
    for (const value of [null, [], '', true, 0]) assert.equal(isContract(name, value), false)
  })
}
test('typed values, provenance classes and temporal variants', () => {
  const values: ClaimValue[] = [
    { type: 'string', value: 'Synthetic' },
    { type: 'number', value: 42 },
    { type: 'boolean', value: false },
    { type: 'date', value: '2024-02-29' },
  ]
  const sources: Provenance[] = [
    { class: 'A' },
    { class: 'B', signatureVerificationId: id },
    { class: 'C', attestationId: id, issuerId: id },
  ]
  for (const value of values) {
    for (const provenance of sources) {
      const c = claim()
      c.value = value
      c.document.provenance = provenance
      assertClaimProvenance(c, c.document)
    }
  }
  const g = grant()
  g.revocation = { status: 'revoked', revokedAt: g.createdAt }
  assert.deepEqual(parseContract('ShareGrant', g), g)
})
test('reject malformed values, pages, dates, opaque IDs and byte encodings', () => {
  const c = claim()
  for (const patch of [
    { value: { type: 'number', value: '42' } },
    { value: { type: 'number', value: NaN } },
    { value: { type: 'date', value: '2026-02-30' } },
    { confidence: 1.01 },
    { pages: [0] },
    { pages: [1, 1] },
    { pages: [] },
    { claimId: 'paul@example.com' },
    { document: { ...c.document, provenance: { class: 'B' } } },
    { period: { start: '2026-12-31', end: '2026-01-01' } },
  ]) {
    assert.throws(() => parseContract('ExtractedClaim', { ...c, ...patch }))
  }
  for (const patch of [
    { iv: 'A'.repeat(15) },
    { iv: 'A'.repeat(16) + '=' },
    { ciphertext: 'A'.repeat(21) + 'B' },
    { ciphertext: 'a+b/' },
    { algorithm: 'none' },
  ]) {
    assert.throws(() => parseContract('EncryptedRecord', { ...record(), ...patch }))
  }
  for (const expiresAt of [
    '2026-02-30T12:00:00.000Z',
    '2026-11-06T12:00:00+00:00',
    grant().createdAt,
  ]) {
    assert.throws(() => parseContract('ShareGrant', { ...grant(), expiresAt }))
  }
  assert.throws(() =>
    parseContract('ShareGrant', {
      ...grant(),
      revocation: { status: 'revoked', revokedAt: '2025-01-01T00:00:00.000Z' },
    }),
  )
})
test('AI cannot promote A into B/C, or substitute source document/evidence', () => {
  const c = claim()
  for (const provenance of [
    { class: 'B', signatureVerificationId: id },
    { class: 'C', attestationId: id, issuerId: id },
  ] satisfies Provenance[]) {
    assert.throws(() =>
      assertClaimProvenance({ ...c, document: { ...c.document, provenance } }, c.document),
    )
  }
  assert.throws(() => assertClaimProvenance(c, { ...c.document, documentId: id }))
  assert.throws(() => assertClaimProvenance(c, { ...c.document, documentVersion: 2 }))
  const b = {
    ...c,
    document: {
      ...c.document,
      provenance: { class: 'B', signatureVerificationId: id } as Provenance,
    },
  }
  assert.throws(() =>
    assertClaimProvenance(b, {
      ...b.document,
      provenance: { class: 'B', signatureVerificationId: c.claimId },
    }),
  )
})
test('share tuples reject substituted recipient, item, key, version and grant', () => {
  assertShareBinding(record(), envelope(), grant())
  for (const patch of [
    { recipientId: id },
    { itemId: id },
    { keyId: id },
    { itemVersion: 2 },
    { grantId: id },
  ]) {
    assert.throws(() => assertShareBinding(record(), { ...envelope(), ...patch }, grant()))
  }
})
test('AES-GCM authenticates record context and rejects a changed item/version/source', async () => {
  const r = record()
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  const iv = new Uint8Array(12)
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: recordAdditionalData(r) },
    key,
    new TextEncoder().encode('synthetic'),
  )
  await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: recordAdditionalData(r) },
    key,
    ciphertext,
  )
  for (const patch of [
    { itemId: id },
    { itemVersion: 2 },
    { sourceClass: 'B' as const },
    { keyId: id },
  ]) {
    await assert.rejects(
      webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: recordAdditionalData({ ...r, ...patch }) },
        key,
        ciphertext,
      ),
    )
  }
})
test('RSA-OAEP label binds key envelope to recipient and immutable tuple', async () => {
  const e = envelope()
  const keys = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['encrypt', 'decrypt'],
  )
  const itemKey = new Uint8Array(32)
  const wrapped = await webcrypto.subtle.encrypt(
    { name: 'RSA-OAEP', label: envelopeLabel(e) },
    keys.publicKey,
    itemKey,
  )
  assert.deepEqual(
    new Uint8Array(
      await webcrypto.subtle.decrypt(
        { name: 'RSA-OAEP', label: envelopeLabel(e) },
        keys.privateKey,
        wrapped,
      ),
    ),
    itemKey,
  )
  for (const patch of [
    { recipientId: id },
    { recipientKeyId: id },
    { itemId: id },
    { itemVersion: 2 },
    { grantId: id },
    { envelopeId: id },
    { keyId: id },
  ]) {
    await assert.rejects(
      webcrypto.subtle.decrypt(
        { name: 'RSA-OAEP', label: envelopeLabel({ ...e, ...patch }) },
        keys.privateKey,
        wrapped,
      ),
    )
  }
})
