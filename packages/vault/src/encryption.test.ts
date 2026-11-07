import { fingerprintRecord } from '@glimpse/vault'
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { fixtures, parseContract, envelopeLabel, recordAdditionalData } from '@glimpse/shared'
import type { DocumentReference, EncryptedRecord, KeyEnvelope } from '@glimpse/shared'
import {
  generateEncryptionKeys,
  generateOpaqueId,
  encryptItem,
  decryptItem,
  openEnvelope,
} from '@glimpse/vault'
import type { EncryptionIdentity, EncryptedItem, ItemExpectation } from '@glimpse/vault'

let holder: EncryptionIdentity
let stranger: EncryptionIdentity
let item: EncryptedItem
let expected: ItemExpectation
const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
const options = { itemId: generateOpaqueId(), itemVersion: 1, grantId: generateOpaqueId() }
const context = (data: EncryptedItem): ItemExpectation => ({
  itemId: data.record.itemId,
  itemVersion: data.record.itemVersion,
  keyId: data.record.keyId,
  sourceClass: data.record.sourceClass,
  grantId: data.envelope.grantId,
  recordDigest: data.recordDigest,
})
const encode = (data: ArrayBuffer | Uint8Array): string =>
  Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data)).toString('base64url')
const flip = (data: string): string => {
  const bytes = Buffer.from(data, 'base64url')
  bytes[0] = (bytes[0] ?? 0) ^ 1
  return bytes.toString('base64url')
}
before(async () => {
  holder = await generateEncryptionKeys(generateOpaqueId())
  stranger = await generateEncryptionKeys(generateOpaqueId())
  item = await encryptItem(claim, claim.document, holder, options)
  expected = context(item)
})
test('independent RSA encryption identity uses non-exportable private key', async () => {
  assert.notEqual(holder.recipientKeyId, stranger.recipientKeyId)
  assert.equal(holder.privateKey.extractable, false)
  assert.equal(holder.publicKey.algorithm.name, 'RSA-OAEP')
  assert.equal((holder.publicKey.algorithm as RsaHashedKeyAlgorithm).hash.name, 'SHA-256')
  assert.deepEqual(holder.privateKey.usages, ['unwrapKey'])
  await assert.rejects(crypto.subtle.exportKey('pkcs8', holder.privateKey))
  const spki = await crypto.subtle.exportKey('spki', holder.publicKey)
  assert.ok(spki.byteLength > 0)
  await assert.rejects(generateEncryptionKeys('email@example.com'))
})
test('holder round-trips JSON serialized wire objects; schemas accept outputs', async () => {
  const wire = JSON.parse(JSON.stringify(item)) as EncryptedItem
  assert.deepEqual(await decryptItem(wire.record, wire.envelope, holder, expected), claim)
  parseContract('EncryptedRecord', wire.record)
  parseContract('KeyEnvelope', wire.envelope)
  const key = await openEnvelope(wire.envelope, holder, expected)
  assert.equal(key.extractable, false)
  assert.equal((key.algorithm as AesKeyAlgorithm).length, 256)
  assert.deepEqual(key.usages, ['decrypt'])
  await assert.rejects(crypto.subtle.exportKey('raw', key))
})
test('new random AES key, IV and envelope per encryption, even with same item/version', async () => {
  const next = await encryptItem(claim, claim.document, holder, options)
  assert.notEqual(next.record.keyId, item.record.keyId)
  assert.notEqual(next.record.iv, item.record.iv)
  assert.notEqual(next.record.ciphertext, item.record.ciphertext)
  assert.notEqual(next.envelope.envelopeId, item.envelope.envelopeId)
  const key = await openEnvelope(item.envelope, holder, expected)
  await assert.rejects(
    crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Buffer.from(next.record.iv, 'base64url'),
        additionalData: new Uint8Array(recordAdditionalData(next.record)),
        tagLength: 128,
      },
      key,
      Buffer.from(next.record.ciphertext, 'base64url'),
    ),
  )
})
test('another recipient rejected, including real OAEP rejection with spoofed metadata', async () => {
  await assert.rejects(decryptItem(item.record, item.envelope, stranger, expected))
  const impersonator = {
    ...stranger,
    recipientId: holder.recipientId,
    recipientKeyId: holder.recipientKeyId,
  }
  await assert.rejects(openEnvelope(item.envelope, impersonator, expected), {
    name: 'OperationError',
  })
})
test('modified ciphertext, authentication tag or IV fails trusted fingerprint validation', async () => {
  for (const ciphertext of [
    flip(item.record.ciphertext),
    encode(Buffer.from(item.record.ciphertext, 'base64url').subarray(0, -1)),
  ]) {
    await assert.rejects(
      decryptItem({ ...item.record, ciphertext }, item.envelope, holder, expected),
      { name: 'IntegrityError' },
    )
  }
  await assert.rejects(
    decryptItem({ ...item.record, iv: flip(item.record.iv) }, item.envelope, holder, expected),
    { name: 'IntegrityError' },
  )
})
test('changed record source class fails trusted fingerprint validation', async () => {
  await assert.rejects(
    decryptItem({ ...item.record, sourceClass: 'B' }, item.envelope, holder, {
      ...expected,
      sourceClass: 'B',
    }),
    { name: 'IntegrityError' },
  )
})
test('changed OAEP context is cryptographically rejected after structural checks', async () => {
  const patches: Partial<KeyEnvelope>[] = [
    { itemId: generateOpaqueId() },
    { itemVersion: 2 },
    { keyId: generateOpaqueId() },
    { grantId: generateOpaqueId() },
    { envelopeId: generateOpaqueId() },
    { recipientId: generateOpaqueId() },
    { recipientKeyId: generateOpaqueId() },
  ]
  for (const patch of patches) {
    const altered = { ...item.envelope, ...patch }
    const relabeledHolder = {
      ...holder,
      recipientId: altered.recipientId,
      recipientKeyId: altered.recipientKeyId,
    }
    await assert.rejects(openEnvelope(altered, relabeledHolder, { ...expected, ...patch }), {
      name: 'OperationError',
    })
  }
})
test('expected trusted context rejects mismatches before returning plaintext', async () => {
  for (const patch of [
    { itemId: generateOpaqueId() },
    { itemVersion: 2 },
    { keyId: generateOpaqueId() },
    { grantId: generateOpaqueId() },
    { sourceClass: 'C' as const },
  ]) {
    await assert.rejects(decryptItem(item.record, item.envelope, holder, { ...expected, ...patch }))
  }
  const swapped = await encryptItem(claim, claim.document, holder, {
    ...options,
    itemId: generateOpaqueId(),
  })
  await assert.rejects(decryptItem(item.record, swapped.envelope, holder, expected))
})
test('corrupted, truncated or wrong-algorithm envelope fails closed', async () => {
  await assert.rejects(
    openEnvelope(
      { ...item.envelope, wrappedKey: flip(item.envelope.wrappedKey) },
      holder,
      expected,
    ),
    { name: 'OperationError' },
  )
  await assert.rejects(
    openEnvelope({ ...item.envelope, wrappedKey: encode(new Uint8Array(256)) }, holder, expected),
    /length/,
  )
  await assert.rejects(openEnvelope({ ...item.envelope, algorithm: 'RSA1_5' }, holder, expected))
  await assert.rejects(
    decryptItem({ ...item.record, algorithm: 'A128GCM' }, item.envelope, holder, expected),
  )
})
test('rejects RSA envelopes carrying a 128-bit AES key', async () => {
  const wrapped = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP', label: new Uint8Array(envelopeLabel(item.envelope)) },
    await crypto.subtle.importKey(
      'spki',
      await crypto.subtle.exportKey('spki', holder.publicKey),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    ),
    new Uint8Array(16),
  )
  await assert.rejects(
    openEnvelope({ ...item.envelope, wrappedKey: encode(wrapped) }, holder, expected),
    /key length/,
  )
})
test('extraction never promotes trusted A; synthetic B/C evidence is preserved', async () => {
  const promoted = {
    ...claim,
    document: {
      ...claim.document,
      provenance: { class: 'B', signatureVerificationId: generateOpaqueId() },
    },
  }
  await assert.rejects(encryptItem(promoted, claim.document, holder, options))
  for (const provenance of [
    { class: 'B', signatureVerificationId: generateOpaqueId() },
    { class: 'C', attestationId: generateOpaqueId(), issuerId: generateOpaqueId() },
  ] satisfies DocumentReference['provenance'][]) {
    const c = { ...claim, document: { ...claim.document, provenance } }
    const encrypted = await encryptItem(c, c.document, holder, options)
    assert.equal(encrypted.record.sourceClass, provenance.class)
    assert.deepEqual(
      await decryptItem(encrypted.record, encrypted.envelope, holder, context(encrypted)),
      c,
    )
    await assert.rejects(
      decryptItem(encrypted.record, encrypted.envelope, stranger, context(encrypted)),
    )
  }
})
test('authenticated but malformed plaintext and class mismatch rejected', async () => {
  // Test producer-held AES key is ephemeral and never committed or persisted.
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  for (const plaintext of [
    'private malformed payload',
    JSON.stringify({
      ...claim,
      document: {
        ...claim.document,
        provenance: { class: 'C', attestationId: generateOpaqueId(), issuerId: generateOpaqueId() },
      },
    }),
    JSON.stringify({ foo: 'invalid claim' }),
  ]) {
    const record: EncryptedRecord = {
      ...item.record,
      iv: encode(crypto.getRandomValues(new Uint8Array(12))),
    }
    record.ciphertext = encode(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: Buffer.from(record.iv, 'base64url'),
          additionalData: new Uint8Array(recordAdditionalData(record)),
          tagLength: 128,
        },
        key,
        new TextEncoder().encode(plaintext),
      ),
    )
    const envelope = {
      ...item.envelope,
      wrappedKey: encode(
        await crypto.subtle.wrapKey('raw', key, holder.publicKey, {
          name: 'RSA-OAEP',
          label: new Uint8Array(envelopeLabel(item.envelope)),
        }),
      ),
    }
    await assert.rejects(
      decryptItem(record, envelope, holder, {
        ...expected,
        recordDigest: await fingerprintRecord(record),
      }),
      (error) => error instanceof Error && !error.message.includes('private malformed payload'),
    )
  }
})
test('metadata contains no claim plaintext; no keys escape encryptItem', () => {
  assert.deepEqual(Object.keys(item).sort(), ['envelope', 'record', 'recordDigest'])
  const json = JSON.stringify(item)
  for (const field of ['attribute', 'value', 'pages', 'documentId', 'privateKey', 'publicKey']) {
    assert.equal(json.includes(`"${field}"`), false)
  }
})
test('reject invalid data and unsupported encryption keys', async () => {
  await assert.rejects(encryptItem({ ...claim, confidence: 2 }, claim.document, holder, options))
  await assert.rejects(
    encryptItem(claim, claim.document, holder, { ...options, itemId: 'personal-data' }),
  )
  const wrong = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-1',
    },
    false,
    ['wrapKey', 'unwrapKey'],
  )
  await assert.rejects(
    encryptItem(claim, claim.document, { ...holder, publicKey: wrong.publicKey }, options),
  )
  await assert.rejects(
    openEnvelope(item.envelope, { ...holder, privateKey: wrong.privateKey }, expected),
  )
})

test('UTF-8 and chunked byte serialization round-trip without plaintext metadata', async () => {
  const unicode = { ...claim, value: { type: 'string' as const, value: '🌍'.repeat(4000) } }
  const encrypted = await encryptItem(unicode, unicode.document, holder, options)
  assert.deepEqual(
    await decryptItem(encrypted.record, encrypted.envelope, holder, context(encrypted)),
    unicode,
  )
})
