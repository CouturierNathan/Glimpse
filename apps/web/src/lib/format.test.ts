import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatClaimValue, shortAddress } from './format.ts'

test('shortAddress keeps the prefix and the last four characters', () => {
  assert.equal(shortAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'), '0x7099…79C8')
})

test('formatClaimValue reads booleans as yes or no', () => {
  assert.equal(formatClaimValue({ type: 'boolean', value: true }), 'Yes')
  assert.equal(formatClaimValue({ type: 'boolean', value: false }), 'No')
})

test('formatClaimValue keeps numbers, dates and strings readable', () => {
  assert.equal(formatClaimValue({ type: 'number', value: 1250.5 }), '1,250.5')
  assert.equal(formatClaimValue({ type: 'date', value: '2026-01-01' }), '2026-01-01')
  assert.equal(formatClaimValue({ type: 'string', value: 'Master' }), 'Master')
})
