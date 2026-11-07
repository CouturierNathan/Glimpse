import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import * as asn1js from 'asn1js'

import { pemCertificates, validatePades } from './pades.ts'

// FAKE fixtures from scripts/make-fake-identity-pdf.ts: a TEST CA, never a real trust anchor.
const fixture = (file: string) =>
  new Uint8Array(readFileSync(new URL(`../../../fixtures/identity/${file}`, import.meta.url)))
const proof = fixture('FAKE-identity-proof.pdf')
const trustAnchors = pemCertificates(
  readFileSync(new URL('../../../fixtures/identity/FAKE-test-ca.pem', import.meta.url), 'utf8'),
)
const now = new Date('2026-11-07T10:00:00.000Z')
const validate = (pdf: Uint8Array, at = now, anchors = trustAnchors) =>
  validatePades(pdf, { trustAnchors: anchors, now: at })

/** Where the signature's hex starts and its DER length, read from the fixture's ByteRange. */
function signatureGap(pdf: Uint8Array) {
  const text = Buffer.from(pdf).toString('latin1')
  const [, b] = /\/ByteRange \[0 (\d+)/.exec(text) ?? []
  const start = Number(b) + 1
  const hex = text.slice(start, text.indexOf('>', start))
  return { start, length: asn1js.fromBER(Buffer.from(hex, 'hex')).offset }
}

test('the FAKE signed proof passes against the TEST CA', async () => {
  const report = await validate(proof)
  assert.equal(report.indication, 'TOTAL_PASSED')
  assert.equal(report.subIndication, undefined)
  assert.ok(Object.values(report.checks).every((c) => c === 'pass'))
  assert.match(report.signer?.subject ?? '', /CN=FAKE France Identite Test Signer/)
  assert.equal(report.signingTime, '2026-11-07T09:00:00.000Z')
  const [anchor] = trustAnchors
  assert.ok(anchor)
  assert.equal(report.trustAnchor, `0x${createHash('sha256').update(anchor).digest('hex')}`)
  assert.equal(report.documentDigest, `0x${createHash('sha256').update(proof).digest('hex')}`)
  assert.notEqual((await validate(proof)).reportId, report.reportId)
})

test('a PDF modified after signing fails integrity', async () => {
  const modified = Uint8Array.from(proof)
  const at = Buffer.from(proof).indexOf('FAKE TEST HOLDER')
  modified[at] = 'X'.charCodeAt(0)
  const report = await validate(modified)
  assert.equal(report.indication, 'TOTAL_FAILED')
  assert.equal(report.subIndication, 'HASH_FAILURE')
  assert.equal(report.checks.integrity, 'fail')

  const appended = Buffer.concat([proof, Buffer.from('\n% unsigned update\n')])
  const update = await validate(appended)
  assert.equal(update.checks.integrity, 'fail')
  assert.equal(update.subIndication, 'FORMAT_FAILURE')
})

test('a tampered signature value fails the signature check', async () => {
  const { start, length } = signatureGap(proof)
  const tampered = Uint8Array.from(proof)
  const last = start + 2 * length - 1 // last hex digit of the DER: inside the signature value
  tampered[last] = tampered[last] === '0'.charCodeAt(0) ? '1'.charCodeAt(0) : '0'.charCodeAt(0)
  const report = await validate(tampered)
  assert.equal(report.checks.signature, 'fail')
  assert.equal(report.indication, 'TOTAL_FAILED')
  assert.equal(report.subIndication, 'SIG_CRYPTO_FAILURE')
})

test('a signer outside the trust anchors fails the chain', async () => {
  const wrong = await validate(fixture('FAKE-identity-proof-wrong-signer.pdf'))
  assert.equal(wrong.indication, 'INDETERMINATE')
  assert.equal(wrong.subIndication, 'NO_CERTIFICATE_CHAIN_FOUND')
  assert.equal(wrong.checks.chain, 'fail')
  assert.equal(wrong.trustAnchor, undefined)

  const untrusted = await validate(proof, now, [])
  assert.equal(untrusted.subIndication, 'NO_CERTIFICATE_CHAIN_FOUND')
})

test('an expired or not yet valid certificate fails validity', async () => {
  const expired = await validate(proof, new Date('2031-06-01T00:00:00.000Z'))
  assert.equal(expired.indication, 'INDETERMINATE')
  assert.equal(expired.subIndication, 'OUT_OF_BOUNDS_NO_POE')
  assert.equal(expired.checks.validity, 'fail')

  const early = await validate(proof, new Date('2025-12-01T00:00:00.000Z'))
  assert.equal(early.subIndication, 'NOT_YET_VALID')
  assert.equal(early.checks.validity, 'fail')
})

test('a file without a PAdES signature fails the format check', async () => {
  for (const pdf of [
    Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n'),
    Buffer.from('not a pdf /ByteRange [0 1 2 3]'),
    new Uint8Array(),
  ]) {
    const report = await validate(new Uint8Array(pdf))
    assert.equal(report.indication, 'TOTAL_FAILED')
    assert.equal(report.subIndication, 'FORMAT_FAILURE')
    assert.equal(report.checks.format, 'fail')
  }
})
