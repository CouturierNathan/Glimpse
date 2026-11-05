import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NonceStore } from './nonces.ts'

test('a nonce can be consumed once', () => {
  const store = new NonceStore(1000)
  const nonce = store.issue(0)
  assert.equal(store.consume(nonce, 10), true)
  assert.equal(store.consume(nonce, 20), false)
})

test('an expired nonce is refused', () => {
  const store = new NonceStore(1000)
  const nonce = store.issue(0)
  assert.equal(store.consume(nonce, 1000), false)
})

test('a nonce this store never issued is refused', () => {
  assert.equal(new NonceStore(1000).consume('abcdef1234567890'), false)
})

test('issued nonces are unique', () => {
  const store = new NonceStore(1000)
  const nonces = new Set(Array.from({ length: 100 }, () => store.issue(0)))
  assert.equal(nonces.size, 100)
})
