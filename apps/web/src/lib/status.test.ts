import assert from 'node:assert/strict'
import { test } from 'node:test'

import { messages } from './i18n/messages.ts'
import { holderStatus, statuses, statusKeys } from './status.ts'

test('every status has a label and a meaning in both languages', () => {
  assert.deepEqual(Object.keys(statusKeys).sort(), [...statuses].sort())
  for (const locale of [messages.en, messages.fr]) {
    for (const status of statuses) {
      assert.ok(locale[statusKeys[status].label].length > 0)
      assert.ok(locale[statusKeys[status].meaning].length > 0)
    }
  }
})

test('imported and signature-verified items stay declared, whatever is claimed', () => {
  assert.equal(holderStatus('A'), 'declared')
  assert.equal(holderStatus('B'), 'declared')
  assert.equal(holderStatus('A', 'authentic'), 'declared')
})

test('an attestation is undetermined until the chain says otherwise', () => {
  assert.equal(holderStatus('C'), 'undetermined')
  assert.equal(holderStatus('C', 'declared'), 'undetermined')
  assert.equal(holderStatus('C', 'authentic'), 'authentic')
  assert.equal(holderStatus('C', 'expired'), 'expired')
  assert.equal(holderStatus('C', 'revoked'), 'revoked')
})
