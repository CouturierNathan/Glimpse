import assert from 'node:assert/strict'
import { test } from 'node:test'

import { HolderKeyError, HolderRegistry, MAX_KEYS_PER_HOLDER } from './holders.ts'

const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const key = (n: number) => n.toString(16).padStart(32, '0')

test('ensure gives a wallet one stable, opaque holder id', () => {
  const registry = new HolderRegistry()
  const id = registry.ensure(ALICE, 1)
  assert.match(id, /^[0-9a-f]{32}$/)
  assert.ok(!ALICE.toLowerCase().includes(id))
  assert.equal(registry.ensure(ALICE.toLowerCase(), 1), id)
  assert.notEqual(registry.ensure(BOB, 1), id)
  assert.notEqual(registry.ensure(ALICE, 2), id, 'another chain is another holder')
})

test('find stays null until the holder registers a key', () => {
  const registry = new HolderRegistry()
  const holderId = registry.ensure(ALICE, 1)
  assert.equal(registry.find(ALICE, 1), null)
  registry.registerKey(ALICE, 1, key(1), 'pk1')
  registry.registerKey(ALICE, 1, key(2), 'pk2')
  assert.deepEqual(registry.find(ALICE, 1), { holderId, encryptionKeyIds: [key(1), key(2)] })
  assert.equal(registry.find(BOB, 1), null)
})

test('registerKey refuses unknown holders, bad ids and rebinding an id', () => {
  const registry = new HolderRegistry()
  assert.throws(() => registry.registerKey(ALICE, 1, key(1), 'pk'), HolderKeyError)
  registry.ensure(ALICE, 1)
  assert.throws(() => registry.registerKey(ALICE, 1, 'not-an-id', 'pk'), HolderKeyError)
  registry.registerKey(ALICE, 1, key(1), 'pk')
  registry.registerKey(ALICE, 1, key(1), 'pk')
  assert.throws(() => registry.registerKey(ALICE, 1, key(1), 'other'), HolderKeyError)
})

test('registerKey caps the number of keys per holder', () => {
  const registry = new HolderRegistry()
  registry.ensure(ALICE, 1)
  for (let i = 0; i < MAX_KEYS_PER_HOLDER; i++) registry.registerKey(ALICE, 1, key(i), `pk${i}`)
  assert.throws(() => registry.registerKey(ALICE, 1, key(999), 'pk'), HolderKeyError)
})
