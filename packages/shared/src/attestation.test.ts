import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixtures, parseContract } from '@glimpse/shared'

const record = () => parseContract('AttestationRecord', fixtures.valid.AttestationRecord)

test('AttestationRecord: accepts each value type and a lowercase holder', () => {
  for (const value of [
    { type: 'string', value: 'Epitech' },
    { type: 'number', value: 18 },
    { type: 'date', value: '2008-02-29' },
  ] as const) {
    assert.deepEqual(parseContract('AttestationRecord', { ...record(), value }).value, value)
  }
  const holder = record().holder.toLowerCase()
  assert.equal(parseContract('AttestationRecord', { ...record(), holder }).holder, holder)
})

test('AttestationRecord: rejects what the chain or the verifier cannot use', () => {
  const r = record()
  const bad: Record<string, unknown>[] = [
    { issuedAt: '2026-11-05T16:36:50.123Z' },
    { expiresAt: r.issuedAt },
    { attestationId: `0x${r.attestationId}` },
    { holder: r.holder.slice(0, -1) },
    { salt: r.salt.slice(0, -2) },
    { salt: r.salt.toUpperCase().replace('0X', '0x') },
    { commitment: r.commitment.slice(2) },
    { attribute: 'Age over 18' },
    { proof: { ...r.proof, type: 'JWS' } },
    { proof: { ...r.proof, chainId: 0 } },
    { proof: { ...r.proof, signature: r.proof.signature.slice(0, -2) } },
    { proof: { ...r.proof, signer: r.holder } },
  ]
  for (const change of bad) {
    assert.throws(() => parseContract('AttestationRecord', { ...r, ...change }), TypeError)
  }
})

const request = () => parseContract('VerificationRequest', fixtures.valid.VerificationRequest)
const result = () => parseContract('VerificationResult', fixtures.valid.VerificationResult)

test('C fixtures describe one flow: issuer, attestation, request, result', () => {
  const entry = parseContract('IssuerRegistryEntry', fixtures.valid.IssuerRegistryEntry)
  assert.equal(entry.issuerId, record().issuerId)
  assert.equal(request().attribute, record().attribute)
  assert.equal(result().requestId, request().requestId)
  assert.equal(result().attestationId, record().attestationId)
  assert.equal(result().issuerId, entry.issuerId)
})

test('IssuerRegistryEntry: metadata is a public https, ipfs or data URI', () => {
  const entry = fixtures.valid.IssuerRegistryEntry
  for (const metadataURI of ['https://school.example/issuer.json', 'ipfs://bafy']) {
    assert.equal(
      parseContract('IssuerRegistryEntry', { ...entry, metadataURI }).metadataURI,
      metadataURI,
    )
  }
  for (const metadataURI of ['', 'http://school.example', 'javascript:alert(1)']) {
    assert.throws(() => parseContract('IssuerRegistryEntry', { ...entry, metadataURI }), TypeError)
  }
})

test('VerificationRequest: rejects what the holder or the verifier cannot use', () => {
  const r = request()
  const bad: Record<string, unknown>[] = [
    { expiresAt: r.createdAt },
    { createdAt: '2026-11-06T10:00:00.123Z' },
    { requestId: `0x${r.requestId}` },
    { requester: r.requester.slice(0, -1) },
    { purpose: '' },
    { attribute: 'Student status' },
    { proof: { ...r.proof, verifyingContract: r.requester } },
    { proof: { ...r.proof, signature: r.proof.signature.slice(0, -2) } },
  ]
  for (const change of bad) {
    assert.throws(() => parseContract('VerificationRequest', { ...r, ...change }), TypeError)
  }
})

test('VerificationResult: verdict, attestation and checks agree', () => {
  const r = result()
  const { attestationId: _a, issuerId: _i, ...declaration } = r
  const failed = { ...r.checks, revocation: 'fail' }
  assert.equal(
    parseContract('VerificationResult', { ...declaration, verdict: 'declared' }).verdict,
    'declared',
  )
  assert.equal(
    parseContract('VerificationResult', { ...r, verdict: 'revoked', checks: failed }).verdict,
    'revoked',
  )
  const bad: Record<string, unknown>[] = [
    { ...r, verdict: 'declared' },
    { ...declaration, verdict: 'authentic' },
    { ...declaration, attestationId: r.attestationId },
    { ...r, checks: failed },
    { ...r, checks: { ...r.checks, replay: 'unknown' } },
    { ...r, verdict: 'trusted' },
  ]
  for (const value of bad) {
    assert.throws(() => parseContract('VerificationResult', value), TypeError)
  }
})
