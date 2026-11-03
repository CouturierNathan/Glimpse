import assert from 'node:assert/strict'
import { test } from 'node:test'

import { shortAddress } from './format.ts'

test('shortAddress keeps the prefix and the last four characters', () => {
  assert.equal(shortAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'), '0x7099…79C8')
})
