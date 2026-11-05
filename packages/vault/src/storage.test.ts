import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import type { TestContext } from 'node:test'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
  mkdir,
  symlink,
  link,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fixtures, parseContract } from '@glimpse/shared'
import { generateEncryptionKeys, generateOpaqueId, encryptItem, decryptItem } from '@glimpse/vault'
import type { EncryptionIdentity, EncryptedItem } from '@glimpse/vault'
import { createVaultStorage, createFileStorageBackend, StorageError } from '@glimpse/vault/server'
import type { StorageBackend, AuthenticatedHolder } from '@glimpse/vault/server'
import { createMemoryStorageBackendForTests } from '@glimpse/vault/server/testing'

let identity: EncryptionIdentity
let otherIdentity: EncryptionIdentity
let holder: AuthenticatedHolder
let other: AuthenticatedHolder
let encrypted: EncryptedItem
const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
const input = () => ({ record: encrypted.record, envelopes: [encrypted.envelope] })
const expected = () => ({ ...encrypted.record, grantId: encrypted.envelope.grantId })
const errorCode = (code: string) => (error: unknown) =>
  error instanceof StorageError && error.code === code
before(async () => {
  identity = await generateEncryptionKeys(generateOpaqueId())
  otherIdentity = await generateEncryptionKeys(generateOpaqueId())
  holder = {
    holderId: identity.recipientId,
    expiresAt: Date.now() + 60_000,
    encryptionKeyIds: [identity.recipientKeyId],
  }
  other = {
    holderId: otherIdentity.recipientId,
    expiresAt: Date.now() + 60_000,
    encryptionKeyIds: [otherIdentity.recipientKeyId],
  }
  encrypted = await encryptItem(claim, claim.document, identity, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
})
async function fileBackend(t: TestContext) {
  const temporary = await mkdtemp(join(tmpdir(), 'glimpse-storage-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const root = join(temporary, 'objects')
  return { root, temporary, backend: await createFileStorageBackend({ directory: root }) }
}
const bind = (backend: StorageBackend, auth: AuthenticatedHolder | null = holder) =>
  createVaultStorage({ backend, authenticate: () => Promise.resolve(auth) })
for (const adapter of ['files', 'memory'] as const) {
  test(`${adapter}: put/get/delete round trip stores only ciphertext and opens on client`, async (t) => {
    const backend =
      adapter === 'files' ? (await fileBackend(t)).backend : createMemoryStorageBackendForTests()
    const store = bind(backend)
    const ref = await store.put(input())
    assert.match(ref, /^[0-9a-f]{64}$/)
    assert.notEqual(ref, await store.put(input()))
    const saved = await store.get(ref)
    assert.ok(saved)
    assert.deepEqual(saved, input())
    assert.deepEqual(
      await decryptItem(saved.record, saved.envelopes[0], identity, expected()),
      claim,
    )
    const raw = await backend.read(holder.holderId, ref, 256 * 1024)
    assert.ok(raw)
    const text = new TextDecoder().decode(raw)
    for (const field of ['attribute', 'value', 'documentId', 'holderId', 'address', 'privateKey']) {
      assert.equal(text.includes(`"${field}"`), false)
    }
    assert.equal(await store.delete(ref), true)
    assert.equal(await store.get(ref), null)
    assert.equal(await store.delete(ref), false)
    assert.equal(await store.get('0'.repeat(64)), null)
  })
  test(`${adapter}: holder isolation and request body cannot change owner`, async (t) => {
    const backend =
      adapter === 'files' ? (await fileBackend(t)).backend : createMemoryStorageBackendForTests()
    const ownerStore = bind(backend)
    const ref = await ownerStore.put(input())
    assert.equal(await bind(backend, other).get(ref), null)
    assert.equal(await bind(backend, other).delete(ref), false)
    assert.deepEqual(await ownerStore.get(ref), input())
    await assert.rejects(bind(backend, other).put(input()), errorCode('FORBIDDEN'))
    await assert.rejects(
      ownerStore.put({ ...input(), holderId: other.holderId }),
      errorCode('INVALID_INPUT'),
    )
    await assert.rejects(
      ownerStore.put({
        ...input(),
        envelopes: [{ ...encrypted.envelope, recipientKeyId: other.encryptionKeyIds[0] }],
      }),
      errorCode('FORBIDDEN'),
    )
  })
  test(`${adapter}: authentication required on every operation, including delete`, async (t) => {
    const backend =
      adapter === 'files' ? (await fileBackend(t)).backend : createMemoryStorageBackendForTests()
    let auth: AuthenticatedHolder | null = holder
    let calls = 0
    const store = createVaultStorage({
      backend,
      authenticate: () => {
        calls++
        return Promise.resolve(auth)
      },
    })
    const ref = await store.put(input())
    for (auth of [
      null,
      { ...holder, expiresAt: Date.now() - 1 },
      { ...holder, holderId: '../escape' },
    ]) {
      await assert.rejects(store.put(input()), errorCode('UNAUTHENTICATED'))
      await assert.rejects(store.get(ref), errorCode('UNAUTHENTICATED'))
      await assert.rejects(store.delete(ref), errorCode('UNAUTHENTICATED'))
    }
    assert.equal(calls, 10)
    assert.deepEqual(await bind(backend).get(ref), input())
  })
  test(`${adapter}: runtime validation, size bounds and path traversal fail closed`, async (t) => {
    const backend =
      adapter === 'files' ? (await fileBackend(t)).backend : createMemoryStorageBackendForTests()
    const store = bind(backend)
    for (const ref of [
      '../escape',
      '/etc/passwd',
      '0'.repeat(64) + '/file',
      'A'.repeat(64),
      '0'.repeat(63),
      '%2e%2e',
    ]) {
      await assert.rejects(store.get(ref), errorCode('INVALID_INPUT'))
      await assert.rejects(store.delete(ref), errorCode('INVALID_INPUT'))
    }
    for (const payload of [
      null,
      {},
      { ...input(), plaintext: 'secret' },
      { ...input(), envelopes: [] },
      { ...input(), envelopes: Array(9).fill(encrypted.envelope) },
      { ...input(), envelopes: [encrypted.envelope, encrypted.envelope] },
      { ...input(), record: { ...encrypted.record, iv: 'wrong' } },
      { ...input(), envelopes: [{ ...encrypted.envelope, itemVersion: 99 }] },
    ]) {
      await assert.rejects(store.put(payload), errorCode('INVALID_INPUT'))
    }
    const tiny = createVaultStorage({
      backend,
      authenticate: () => Promise.resolve(holder),
      maxObjectBytes: 100,
    })
    await assert.rejects(tiny.put(input()), errorCode('TOO_LARGE'))
    await assert.rejects(
      store.put({ ...input(), record: { ...encrypted.record, ciphertext: 'A'.repeat(300_000) } }),
      errorCode('TOO_LARGE'),
    )
  })
  test(`${adapter}: malformed or oversized persisted bytes rejected as corruption`, async (t) => {
    const backend =
      adapter === 'files' ? (await fileBackend(t)).backend : createMemoryStorageBackendForTests()
    const store = bind(backend)
    for (const bytes of [
      new TextEncoder().encode('{not json'),
      new Uint8Array([0xff]),
      new TextEncoder().encode(JSON.stringify({ storageVersion: 2, ...input() })),
      new TextEncoder().encode(JSON.stringify({ storageVersion: 1, ...input(), plaintext: 'bad' })),
      new Uint8Array(300_000),
    ]) {
      const ref = generateOpaqueId() + generateOpaqueId()
      assert.ok(await backend.create(holder.holderId, ref, bytes))
      await assert.rejects(store.get(ref), errorCode('CORRUPT'))
    }
  })
  test(`${adapter}: syntactically valid cryptographic corruption reaches GCM and is rejected`, async (t) => {
    const backend =
      adapter === 'files' ? (await fileBackend(t)).backend : createMemoryStorageBackendForTests()
    const store = bind(backend)
    const bad = Buffer.from(encrypted.record.ciphertext, 'base64url')
    bad[0] = (bad[0] ?? 0) ^ 1
    const damaged = {
      ...input(),
      record: { ...encrypted.record, ciphertext: bad.toString('base64url') },
    }
    const ref = generateOpaqueId() + generateOpaqueId()
    await backend.create(
      holder.holderId,
      ref,
      new TextEncoder().encode(JSON.stringify({ storageVersion: 1, ...damaged })),
    )
    const saved = await store.get(ref)
    assert.ok(saved)
    await assert.rejects(decryptItem(saved.record, saved.envelopes[0], identity, expected()), {
      name: 'OperationError',
    })
  })
}
test('file storage persists across adapter instances with private files and atomic collision handling', async (t) => {
  const { root, backend } = await fileBackend(t)
  const store = bind(backend)
  const ref = await store.put(input())
  const restarted = bind(await createFileStorageBackend({ directory: root }))
  assert.deepEqual(await restarted.get(ref), input())
  const filename = join(root, holder.holderId, `${ref}.json`)
  assert.equal((await stat(filename)).mode & 0o777, 0o600)
  assert.equal((await stat(join(root, holder.holderId))).mode & 0o777, 0o700)
  const original = await readFile(filename)
  assert.equal(await backend.create(holder.holderId, ref, new Uint8Array([1])), false)
  assert.deepEqual(await readFile(filename), original)
  const refs = await Promise.all(Array.from({ length: 12 }, () => store.put(input())))
  assert.equal(new Set(refs).size, refs.length)
  assert.equal(
    (await readdir(join(root, holder.holderId))).some((name) => name.startsWith('.pending-')),
    false,
  )
  assert.equal(await restarted.delete(ref), true)
  assert.equal(await store.get(ref), null)
})
test('file backend rejects symlink root, holder directories, files and hard links', async (t) => {
  const { root, temporary, backend } = await fileBackend(t)
  const outside = join(temporary, 'outside')
  await mkdir(outside, { mode: 0o700 })
  const alias = join(temporary, 'alias')
  await symlink(outside, alias)
  await assert.rejects(createFileStorageBackend({ directory: alias }), errorCode('UNAVAILABLE'))
  await symlink(outside, join(root, holder.holderId))
  await assert.rejects(bind(backend).put(input()), errorCode('UNAVAILABLE'))
  await assert.rejects(bind(backend).get('0'.repeat(64)), errorCode('UNAVAILABLE'))
  await rm(join(root, holder.holderId))
  await mkdir(join(root, holder.holderId), { mode: 0o700 })
  const sentinel = join(outside, 'sentinel')
  await writeFile(sentinel, 'untouched')
  const ref = '1'.repeat(64)
  const target = join(root, holder.holderId, `${ref}.json`)
  await symlink(sentinel, target)
  await assert.rejects(bind(backend).get(ref), errorCode('CORRUPT'))
  await assert.rejects(bind(backend).delete(ref), errorCode('CORRUPT'))
  assert.equal(await readFile(sentinel, 'utf8'), 'untouched')
  await rm(target)
  await link(sentinel, target)
  await assert.rejects(bind(backend).get(ref), errorCode('CORRUPT'))
})
test('actual disk corruption is detected after restarting the file adapter', async (t) => {
  const { root, backend } = await fileBackend(t)
  const ref = await bind(backend).put(input())
  await writeFile(join(root, holder.holderId, `${ref}.json`), 'truncated')
  await assert.rejects(
    bind(await createFileStorageBackend({ directory: root })).get(ref),
    errorCode('CORRUPT'),
  )
})
test('memory adapter copies data and backend failures never expose internal paths', async () => {
  const backend = createMemoryStorageBackendForTests()
  const ref = '2'.repeat(64)
  const bytes = new Uint8Array([1, 2])
  await backend.create(holder.holderId, ref, bytes)
  bytes[0] = 9
  const saved = await backend.read(holder.holderId, ref, 100)
  assert.ok(saved)
  saved[0] = 8
  assert.deepEqual(await backend.read(holder.holderId, ref, 100), new Uint8Array([1, 2]))
  const broken = createVaultStorage({
    backend: { ...backend, read: () => Promise.reject(new Error('/private/path')) },
    authenticate: () => Promise.resolve(holder),
  })
  await assert.rejects(
    broken.get(ref),
    (error) =>
      errorCode('UNAVAILABLE')(error) &&
      error instanceof Error &&
      !error.message.includes('/private/path'),
  )
})
test('browser entry remains clean and browser resolver blocks server import', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=browser',
      '--input-type=module',
      '-e',
      "await import('@glimpse/vault'); try { await import('@glimpse/vault/server'); process.exitCode = 1 } catch (error) { if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error }",
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
})
