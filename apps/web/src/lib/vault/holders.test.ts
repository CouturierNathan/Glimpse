import assert from 'node:assert/strict'
import { test } from 'node:test'

import { memoryKv } from '../state/kv.ts'

import { HolderKeyError, HolderRegistry, MAX_KEYS_PER_HOLDER } from './holders.ts'

const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const key = (n: number) => n.toString(16).padStart(32, '0')
const secret = () => Buffer.alloc(32, 1)

test('a wallet has one opaque holder id, the same after a restart or on another instance', () => {
  const store = memoryKv()
  const id = new HolderRegistry(store, secret).ensure(ALICE, 1)
  assert.match(id, /^[0-9a-f]{32}$/)
  assert.equal(new HolderRegistry(memoryKv(), secret).ensure(ALICE.toLowerCase(), 1), id)
  assert.notEqual(new HolderRegistry(store, secret).ensure(ALICE, 2), id)
  assert.notEqual(new HolderRegistry(store, secret).ensure(BOB, 1), id)
  // Without the server's secret the id does not lead back to the wallet.
  assert.notEqual(new HolderRegistry(store, () => Buffer.alloc(32, 2)).ensure(ALICE, 1), id)
  assert.equal(id.includes(ALICE.slice(2).toLowerCase()), false)
})

test('find stays null until the holder registers a key, and sees keys another instance wrote', async () => {
  const store = memoryKv()
  const one = new HolderRegistry(store, secret)
  const two = new HolderRegistry(store, secret)
  assert.equal(await one.find(ALICE, 1), null)
  await one.registerKey(ALICE, 1, key(1), 'pk1')
  assert.deepEqual(await two.find(ALICE, 1), {
    holderId: one.ensure(ALICE, 1),
    encryptionKeyIds: [key(1)],
  })
  assert.equal(await two.publicKey(one.ensure(ALICE, 1), key(1)), 'pk1')
  assert.equal(await two.publicKey(one.ensure(ALICE, 1), key(2)), null)
})

test('registerKey refuses bad ids and rebinding an id, and accepts the same key again', async () => {
  const registry = new HolderRegistry(memoryKv(), secret)
  await assert.rejects(registry.registerKey(ALICE, 1, 'nope', 'pk'), HolderKeyError)
  await registry.registerKey(ALICE, 1, key(1), 'pk1')
  await registry.registerKey(ALICE, 1, key(1), 'pk1')
  await assert.rejects(registry.registerKey(ALICE, 1, key(1), 'other'), HolderKeyError)
})

test('registerKey caps the number of keys per holder', async () => {
  const registry = new HolderRegistry(memoryKv(), secret)
  for (let n = 0; n < MAX_KEYS_PER_HOLDER; n++) {
    await registry.registerKey(ALICE, 1, key(n), `pk${n}`)
  }
  await assert.rejects(registry.registerKey(ALICE, 1, key(999), 'pk'), HolderKeyError)
})
