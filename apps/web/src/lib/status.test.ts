import assert from 'node:assert/strict'
import { test } from 'node:test'

import { holderStatus, statusCopy, statuses } from './status.ts'

test('every status has a label and a meaning', () => {
  assert.deepEqual(Object.keys(statusCopy).sort(), [...statuses].sort())
  for (const status of statuses) {
    assert.ok(statusCopy[status].label.length > 0)
    assert.ok(statusCopy[status].meaning.length > 0)
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
