import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtures, parseContract, recordAdditionalData, envelopeLabel } from '@glimpse/shared'
import {
  generateEncryptionKeys,
  generateOpaqueId,
  encryptItem,
  decryptItem,
  packEncryptedItem,
  verifyEncryptedItem,
  fingerprintBytes,
} from '@glimpse/vault'
import { createVaultStorage, createFileStorageBackend, StorageError } from '@glimpse/vault/server'
import { createMemoryStorageBackendForTests } from '@glimpse/vault/server/testing'
const encode = (bytes: ArrayBuffer) => Buffer.from(bytes).toString('base64url')
test('well-formed public-key forgery is rejected even when all public identifiers match', async () => {
  const holder = await generateEncryptionKeys(generateOpaqueId())
  const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
  const item = await encryptItem(claim, claim.document, holder, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  // Malicious storage has only the public encryption key and the stored public metadata.
  const attackKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
  const forgedClaim = { ...claim, value: { type: 'number', value: 999999 } }
  const forgedRecord = {
    ...item.record,
    iv: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url'),
  }
  forgedRecord.ciphertext = encode(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: Buffer.from(forgedRecord.iv, 'base64url'),
        additionalData: new Uint8Array(recordAdditionalData(forgedRecord)),
        tagLength: 128,
      },
      attackKey,
      new TextEncoder().encode(JSON.stringify(forgedClaim)),
    ),
  )
  const forgedEnvelope = {
    ...item.envelope,
    wrappedKey: encode(
      await crypto.subtle.wrapKey('raw', attackKey, holder.publicKey, {
        name: 'RSA-OAEP',
        label: new Uint8Array(envelopeLabel(item.envelope)),
      }),
    ),
  }
  parseContract('EncryptedRecord', forgedRecord)
  parseContract('KeyEnvelope', forgedEnvelope)
  // Establish that AEAD alone accepts the attacker's internally consistent packet.
  const opened = await crypto.subtle.unwrapKey(
    'raw',
    Buffer.from(forgedEnvelope.wrappedKey, 'base64url'),
    holder.privateKey,
    { name: 'RSA-OAEP', label: new Uint8Array(envelopeLabel(forgedEnvelope)) },
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const raw = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: Buffer.from(forgedRecord.iv, 'base64url'),
      additionalData: new Uint8Array(recordAdditionalData(forgedRecord)),
      tagLength: 128,
    },
    opened,
    Buffer.from(forgedRecord.ciphertext, 'base64url'),
  )
  assert.equal(
    (JSON.parse(new TextDecoder().decode(raw)) as { value: { value: number } }).value.value,
    999999,
  )
  const expected = {
    ...item.record,
    grantId: item.envelope.grantId,
    recordDigest: item.recordDigest,
  }
  await assert.rejects(decryptItem(forgedRecord, forgedEnvelope, holder, expected), {
    name: 'IntegrityError',
  })
  assert.deepEqual(await decryptItem(item.record, item.envelope, holder, expected), claim)
})
test('exact pinned upload bytes survive file persistence; server substitution fails before parsing', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'glimpse-pinned-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const holder = await generateEncryptionKeys(generateOpaqueId())
  const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
  const item = await encryptItem(claim, claim.document, holder, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  const api = createVaultStorage({
    backend: await createFileStorageBackend({ directory: root }),
    authenticate: () =>
      Promise.resolve({
        holderId: holder.recipientId,
        encryptionKeyIds: [holder.recipientKeyId],
        expiresAt: Date.now() + 60_000,
      }),
  })
  const packed = await packEncryptedItem({ record: item.record, envelopes: [item.envelope] })
  // The exact-byte endpoint must not normalize whitespace/key order provided by a trusted client.
  const pretty = new TextEncoder().encode(
    JSON.stringify(JSON.parse(new TextDecoder().decode(packed.bytes)), null, 2) + '\n',
  )
  const pin = await fingerprintBytes(pretty)
  const ref = await api.putBytes(pretty)
  const bytes = await api.getBytes(ref)
  assert.ok(bytes)
  assert.deepEqual(bytes, pretty)
  assert.deepEqual(await verifyEncryptedItem(bytes, pin), {
    record: item.record,
    envelopes: [item.envelope],
  })
  await writeFile(join(root, holder.recipientId, `${ref}.json`), packed.bytes)
  const altered = await api.getBytes(ref)
  assert.ok(altered)
  await assert.rejects(verifyEncryptedItem(altered, pin), { name: 'IntegrityError' })
})
test('key removal produces FORBIDDEN rather than a false corruption diagnosis', async () => {
  const holder = await generateEncryptionKeys(generateOpaqueId())
  const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
  const item = await encryptItem(claim, claim.document, holder, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  let ids = [holder.recipientKeyId]
  const api = createVaultStorage({
    backend: createMemoryStorageBackendForTests(),
    authenticate: () =>
      Promise.resolve({
        holderId: holder.recipientId,
        encryptionKeyIds: ids,
        expiresAt: Date.now() + 60_000,
      }),
  })
  const ref = await api.putBytes(
    (await packEncryptedItem({ record: item.record, envelopes: [item.envelope] })).bytes,
  )
  ids = [generateOpaqueId()]
  for (const read of [() => api.get(ref), () => api.getBytes(ref)]) {
    await assert.rejects(read(), (e) => e instanceof StorageError && e.code === 'FORBIDDEN')
  }
})
