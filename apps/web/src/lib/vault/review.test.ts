import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assertClaimProvenance, type ExtractedClaim, fixtures } from '@glimpse/shared'

import { parseClaimValue, rawClaimValue, reviewClaim } from './review.ts'

const claim = fixtures.valid.ExtractedClaim as ExtractedClaim
const signed: ExtractedClaim = {
  ...claim,
  document: {
    ...claim.document,
    provenance: { class: 'B', signatureVerificationId: 'c'.repeat(32) },
  },
}

test('typed input is read as the claim type, or refused', () => {
  assert.deepEqual(parseClaimValue('number', ' 41.5 '), { type: 'number', value: 41.5 })
  assert.deepEqual(parseClaimValue('boolean', 'false'), { type: 'boolean', value: false })
  assert.deepEqual(parseClaimValue('date', '2026-02-28'), { type: 'date', value: '2026-02-28' })
  assert.deepEqual(parseClaimValue('string', ' Paris '), { type: 'string', value: 'Paris' })
  for (const [type, raw] of [
    ['number', ''],
    ['number', 'abc'],
    ['boolean', 'yes'],
    ['date', '28/02/2026'],
    ['string', '  '],
  ] as const) {
    assert.equal(parseClaimValue(type, raw), null)
  }
})

test('an unchanged claim keeps its source, a corrected one becomes the holder declaration', () => {
  assert.equal(reviewClaim(signed, rawClaimValue(signed.value)), signed)
  const corrected = reviewClaim(signed, '43')
  assert.deepEqual(corrected.value, { type: 'number', value: 43 })
  assert.deepEqual(corrected.document.provenance, { class: 'A' })
  assertClaimProvenance(corrected, corrected.document)
  assert.throws(() => reviewClaim(signed, 'forty'), TypeError)
})
