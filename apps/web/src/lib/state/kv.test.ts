import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { fileKv, type Kv, KvFullError, memoryKv, redisKv } from './kv.ts'
import { kvStorageBackend } from './vault-backend.ts'

/** A Redis REST endpoint as Upstash answers it, for GET / SET [PX n] [NX] / DEL. */
function fakeRedis(now: () => number) {
  const data = new Map<string, { value: string; expiresAt: number }>()
  const live = (key: string) => {
    const entry = data.get(key)
    if (entry && entry.expiresAt <= now()) data.delete(key)
    return data.get(key)
  }
  const calls: unknown[] = []
  const fetcher = (async (_url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).Authorization
    if (auth !== 'Bearer token') return Response.json({ error: 'unauthorized' }, { status: 401 })
    const [command, key = '', ...rest] = JSON.parse(String(init?.body)) as string[]
    calls.push(command)
    let result: unknown = null
    if (command === 'GET') result = live(key)?.value ?? null
    if (command === 'DEL') result = live(key) && data.delete(key) ? 1 : 0
    if (command === 'SET') {
      const px = rest.indexOf('PX')
      const nx = rest.includes('NX')
      if (!(nx && live(key))) {
        data.set(key, {
          value: rest[0] ?? '',
          expiresAt: px >= 0 ? now() + Number(rest[px + 1]) : Infinity,
        })
        result = 'OK'
      }
    }
    return Response.json({ result })
  }) as typeof fetch
  return { fetcher, calls }
}

async function behaves(name: string, make: (now: () => number) => Promise<Kv> | Kv) {
  let clock = 1_000
  const kv = await make(() => clock)
  await test(`${name}: set, get, delete`, async () => {
    assert.equal(await kv.get('a'), null)
    assert.equal(await kv.set('a', '1'), true)
    assert.equal(await kv.get('a'), '1')
    assert.equal(await kv.set('a', '2'), true)
    assert.equal(await kv.get('a'), '2')
    assert.equal(await kv.del('a'), true)
    assert.equal(await kv.get('a'), null)
  })
  await test(`${name}: create-if-absent never overwrites`, async () => {
    assert.equal(await kv.set('b', 'first', { onlyIfAbsent: true }), true)
    assert.equal(await kv.set('b', 'second', { onlyIfAbsent: true }), false)
    assert.equal(await kv.get('b'), 'first')
  })
  await test(`${name}: an entry lapses after its lifetime`, async () => {
    await kv.set('c', 'x', { ttlMs: 500 })
    clock += 499
    assert.equal(await kv.get('c'), 'x')
    clock += 2
    assert.equal(await kv.get('c'), null)
    assert.equal(await kv.set('c', 'y', { onlyIfAbsent: true }), true)
  })
}

await behaves('memory', (now) => memoryKv(100, now))

const directory = await mkdtemp(join(tmpdir(), 'glimpse-kv-'))
await behaves('file', (now) => fileKv(directory, now))

test('file: another process on the same directory reads the same state, and no key is a filename', async () => {
  await fileKv(directory).set('holder-keys:abc', 'v')
  assert.equal(await fileKv(directory).get('holder-keys:abc'), 'v')
  const names = await readdir(directory)
  assert.ok(names.every((n) => /^[0-9a-f]{64}$/.test(n)))
  const content = await Promise.all(names.map((n) => readFile(join(directory, n), 'utf8')))
  assert.ok(content.every((c) => !c.includes('holder-keys')))
  await rm(directory, { recursive: true, force: true })
})

await behaves('redis', (now) => redisKv('https://kv.example', 'token', fakeRedis(now).fetcher))

test('redis: a refused token is an error, never an empty answer', async () => {
  const kv = redisKv('https://kv.example', 'wrong', fakeRedis(() => 0).fetcher)
  await assert.rejects(kv.get('a'))
})

test('memory: a full store refuses new keys instead of growing', async () => {
  const kv = memoryKv(2)
  await kv.set('a', '1')
  await kv.set('b', '2')
  await assert.rejects(kv.set('c', '3'), KvFullError)
  await kv.set('a', 'again')
})

class StorageError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.name = 'StorageError'
    this.code = code
  }
}

test('the vault backend over the shared store keeps bytes as given, once per reference', async () => {
  const backend = kvStorageBackend(memoryKv(), StorageError)
  const holder = 'a'.repeat(32)
  const ref = 'b'.repeat(64)
  const bytes = new Uint8Array([0, 1, 2, 250, 255])
  assert.equal(await backend.create(holder, ref, bytes), true)
  assert.equal(await backend.create(holder, ref, new Uint8Array([9])), false)
  assert.deepEqual(await backend.read(holder, ref, 100), bytes)
  assert.equal(await backend.read('c'.repeat(32), ref, 100), null)
  await assert.rejects(backend.read(holder, ref, 2), { code: 'CORRUPT' })
  await assert.rejects(backend.read('../etc', ref, 100), { code: 'INVALID_INPUT' })
  assert.equal(await backend.remove(holder, ref), true)
  assert.equal(await backend.read(holder, ref, 100), null)
})

test('an unreachable shared store reads as unavailable', async () => {
  const down: Kv = {
    get: () => Promise.reject(new Error('down')),
    set: () => Promise.reject(new Error('down')),
    del: () => Promise.reject(new Error('down')),
  }
  await assert.rejects(
    kvStorageBackend(down, StorageError).read('a'.repeat(32), 'b'.repeat(64), 10),
    { code: 'UNAVAILABLE' },
  )
})
