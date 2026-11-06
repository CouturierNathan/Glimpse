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
