import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EXTRACTION_CONSENT_TTL_MS, ExtractionConsentStore } from './consents.ts'

const holderId = 'a'.repeat(32)
const documentId = 'b'.repeat(32)

test('a granted consent reads back complete and expiring', () => {
  const store = new ExtractionConsentStore()
  store.grant({ holderId, documentId, documentVersion: 1, attributes: ['exam_score'] }, 1000)
  assert.deepEqual(store.read(holderId, documentId), {
    holderId,
    documentId,
    documentVersion: 1,
    attributes: ['exam_score'],
    purpose: 'extract-attributes',
    policyVersion: '1',
    granted: true,
    expiresAt: 1000 + EXTRACTION_CONSENT_TTL_MS,
  })
})

test('a consent belongs to one holder and one document', () => {
  const store = new ExtractionConsentStore()
  store.grant({ holderId, documentId, documentVersion: 1, attributes: ['exam_score'] })
  assert.equal(store.read('c'.repeat(32), documentId), null)
  assert.equal(store.read(holderId, 'c'.repeat(32)), null)
})

test('a read copy cannot widen the stored consent', () => {
  const store = new ExtractionConsentStore()
  store.grant({ holderId, documentId, documentVersion: 1, attributes: ['exam_score'] })
  store.read(holderId, documentId)?.attributes.push('student_status')
  assert.deepEqual(store.read(holderId, documentId)?.attributes, ['exam_score'])
})

test('withdraw ends the consent', () => {
  const store = new ExtractionConsentStore()
  store.grant({ holderId, documentId, documentVersion: 1, attributes: ['exam_score'] })
  store.withdraw(holderId, documentId)
  assert.equal(store.read(holderId, documentId), null)
})
