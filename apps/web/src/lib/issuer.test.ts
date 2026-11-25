import assert from 'node:assert/strict'
import { test } from 'node:test'

import { attestationCommitment } from '@glimpse/verifier'
import { type Address, type Hex, verifyTypedData } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import {
  draftAttestation,
  IssuerInputError,
  issuerMetadataURI,
  issuerName,
  parseAttestedValue,
  readAttestationFile,
} from './issuer.ts'

const registry = '0xE481E72D9aBe5B4a43405B2C58cAA972d0a6dDd6' as Address
const chainId = 84532
const signer = privateKeyToAccount(generatePrivateKey())
const holder = privateKeyToAccount(generatePrivateKey()).address
const issuerId = `0x${'ab'.repeat(16)}` as Hex

function draft(overrides: Partial<Parameters<typeof draftAttestation>[0]> = {}) {
  return draftAttestation({
    issuerId,
    holder: holder.toLowerCase(),
    attribute: 'student_status',
    value: { type: 'boolean', value: true },
    issuedAt: 1_790_000_000,
    validDays: 30,
    chainId,
    attestationRegistry: registry,
    ...overrides,
  })
}

async function signedRecord() {
  const d = draft()
  const signature = await signer.signTypedData({
    domain: d.domain,
    types: d.types,
    primaryType: 'Attestation',
    message: d.message,
  })
  return { d, record: d.record(signature) }
}

test('a drafted attestation carries a signature the issuer signer recovers to', async () => {
  const { d, record } = await signedRecord()

  const valid = await verifyTypedData({
    address: signer.address,
    domain: d.domain,
    types: d.types,
    primaryType: 'Attestation',
    message: d.message,
    signature: record.proof.signature as Hex,
  })

  assert.equal(valid, true)
  assert.equal(record.holder, holder)
  assert.equal(record.expiresAt, new Date((1_790_000_000 + 30 * 86400) * 1000).toISOString())
})

test('the commitment on chain matches the record the holder receives', async () => {
  const { d, record } = await signedRecord()

  const recomputed = attestationCommitment({
    salt: record.salt as Hex,
    attestationId: `0x${record.attestationId}`,
    holder: record.holder as Address,
    attribute: record.attribute,
    value: record.value,
  })

  assert.equal(recomputed, d.message.commitment)
  assert.equal(record.commitment, d.message.commitment)
})

test('two drafts of the same attribute get different ids, salts and commitments', () => {
  const a = draft()
  const b = draft()

  assert.notEqual(a.message.attestationId, b.message.attestationId)
  assert.notEqual(a.message.commitment, b.message.commitment)
})

test('rejects a holder that is not an address and a validity out of range', () => {
  assert.throws(() => draft({ holder: 'alice' }), IssuerInputError)
  assert.throws(() => draft({ validDays: 0 }), IssuerInputError)
  assert.throws(() => draft({ validDays: 10_000 }), IssuerInputError)
})

test('parses typed values and refuses what their type cannot hold', () => {
  assert.deepEqual(parseAttestedValue('boolean', 'false'), { type: 'boolean', value: false })
  assert.deepEqual(parseAttestedValue('number', ' 15.5 '), { type: 'number', value: 15.5 })
  assert.deepEqual(parseAttestedValue('date', '2027-06-30'), { type: 'date', value: '2027-06-30' })
  assert.throws(() => parseAttestedValue('number', ''), IssuerInputError)
  assert.throws(() => parseAttestedValue('number', 'twelve'), IssuerInputError)
  assert.throws(() => parseAttestedValue('date', '30/06/2027'), IssuerInputError)
  assert.throws(() => parseAttestedValue('boolean', 'yes'), IssuerInputError)
})

test('issuer metadata round-trips its name and refuses an empty one', () => {
  const uri = issuerMetadataURI('  Epitech Paris ')

  assert.equal(issuerName(uri), 'Epitech Paris')
  assert.equal(
    issuerName('data:application/json,{"name":"Glimpse demo school"}'),
    'Glimpse demo school',
  )
  assert.equal(
    issuerName('https://school.example/issuer.json'),
    'https://school.example/issuer.json',
  )
  assert.throws(() => issuerMetadataURI('   '), IssuerInputError)
})

test('the holder accepts an attestation file issued to their wallet on the app registry', async () => {
  const { record } = await signedRecord()
  const context = { holder, chainId, attestationRegistry: registry }

  const read = readAttestationFile(JSON.stringify(record), context)

  assert.deepEqual(read, record)
})

test('the holder refuses a file for another wallet, another network or no attestation', async () => {
  const { record } = await signedRecord()
  const context = { holder, chainId, attestationRegistry: registry }
  const other = privateKeyToAccount(generatePrivateKey()).address

  assert.throws(() => readAttestationFile('not json', context), IssuerInputError)
  assert.throws(() => readAttestationFile('{"attribute":"x"}', context), IssuerInputError)
  assert.throws(
    () => readAttestationFile(JSON.stringify(record), { ...context, holder: other }),
    /another wallet/,
  )
  assert.throws(
    () => readAttestationFile(JSON.stringify(record), { ...context, chainId: 11155111 }),
    /another network/,
  )
  assert.throws(
    () => readAttestationFile(JSON.stringify(record), { ...context, attestationRegistry: other }),
    /another network/,
  )
})
