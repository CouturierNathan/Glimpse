import assert from 'node:assert/strict'
import { test } from 'node:test'

import { memoryKv } from '../state/kv.ts'

import { EXTRACTION_CONSENT_TTL_MS, ExtractionConsentStore } from './consents.ts'

const holderId = 'a'.repeat(32)
const documentId = 'b'.repeat(32)
const grant = { holderId, documentId, documentVersion: 1, attributes: ['exam_score'] }

test('a granted consent reads back complete and expiring', async () => {
  const store = new ExtractionConsentStore(memoryKv())
  await store.grant(grant, 1000)
  assert.deepEqual(await store.read(holderId, documentId), {
    ...grant,
    purpose: 'extract-attributes',
    policyVersion: '1',
    granted: true,
    expiresAt: 1000 + EXTRACTION_CONSENT_TTL_MS,
  })
})

test('a consent belongs to one holder and one document', async () => {
  const store = new ExtractionConsentStore(memoryKv())
  await store.grant(grant)
  assert.equal(await store.read('c'.repeat(32), documentId), null)
  assert.equal(await store.read(holderId, 'c'.repeat(32)), null)
})

test('a read copy cannot widen the stored consent', async () => {
  const store = new ExtractionConsentStore(memoryKv())
  await store.grant(grant)
  ;(await store.read(holderId, documentId))?.attributes.push('student_status')
  assert.deepEqual((await store.read(holderId, documentId))?.attributes, ['exam_score'])
})

test('withdraw ends the consent, and it lapses on its own', async () => {
  let now = 0
  const kv = memoryKv(100, () => now)
  const store = new ExtractionConsentStore(kv)
  await store.grant(grant)
  await store.withdraw(holderId, documentId)
  assert.equal(await store.read(holderId, documentId), null)
  await store.grant(grant)
  now = EXTRACTION_CONSENT_TTL_MS + 1
  assert.equal(await store.read(holderId, documentId), null)
})
