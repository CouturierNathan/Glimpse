import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { zeroAddress, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { fixtures, type VerificationRequest } from '@glimpse/shared'
import {
  requestDomain,
  requestMessage,
  requestTypes,
  verify,
  type VerifierConfig,
} from './index.ts'

const record = fixtures.valid.AttestationRecord
const request = fixtures.valid.VerificationRequest as VerificationRequest
// What getAnchor returns once the fixture record is anchored by its signer, Hardhat account #0.
const anchored = {
  issuerId: `0x${record.issuerId}` as Hex,
  signer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
  issuedAt: BigInt(Date.parse(record.issuedAt) / 1000),
  expiresAt: BigInt(Date.parse(record.expiresAt) / 1000),
  revokedAt: 0n,
  commitment: record.commitment as Hex,
}
const neverAnchored = {
  issuerId: `0x${'0'.repeat(32)}` as Hex,
  signer: zeroAddress,
  issuedAt: 0n,
  expiresAt: 0n,
  revokedAt: 0n,
  commitment: `0x${'0'.repeat(64)}` as Hex,
}

function setup(
  chain: Partial<typeof anchored> | Error = {},
  overrides: Partial<VerifierConfig> = {},
) {
  const reads: string[] = []
  const client = {
    readContract: async ({ functionName }: { functionName: string }) => {
      reads.push(functionName)
      if (chain instanceof Error) throw chain
      return { ...anchored, ...chain }
    },
  } as unknown as VerifierConfig['client']
  const config: VerifierConfig = {
    client,
    chainId: 31337,
    attestationRegistry: record.proof.verifyingContract as Address,
    trustedIssuers: [record.issuerId],
    answered: new Set(),
    now: () => new Date('2026-11-06T10:05:00.000Z'),
    ...overrides,
  }
  return { config, reads }
}

const requester = privateKeyToAccount(generatePrivateKey())
async function signedRequest(createdAt: string, changes: Partial<VerificationRequest> = {}) {
  const fields = {
    ...request,
    requestId: crypto.randomUUID().replaceAll('-', ''),
    requester: requester.address,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 15 * 60_000).toISOString(),
  }
  const signature = await requester.signTypedData({
    domain: requestDomain(31337),
    types: requestTypes,
    primaryType: 'VerificationRequest',
    message: requestMessage(fields),
  })
  return { ...fields, proof: { type: 'EIP712', chainId: 31337, signature }, ...changes }
}

describe('verify', () => {
  it('turns the fixture request and record into the fixture result, from getAnchor alone', async () => {
    const { config, reads } = setup()
    assert.deepEqual(await verify(request, record, config), fixtures.valid.VerificationResult)
    // No Glimpse server in the loop: the only call goes to the registry through the RPC.
    assert.deepEqual(reads, ['getAnchor'])
  })

  it('keeps the issuer policy apart from authenticity', async () => {
    const { config } = setup({}, { trustedIssuers: [] })
    const result = await verify(request, record, config)
    assert.equal(result.verdict, 'authentic')
    assert.equal(result.issuerTrusted, false)
  })

  it('reports a revoked attestation', async () => {
    const { config } = setup({ revokedAt: anchored.issuedAt + 60n })
    const result = await verify(request, record, config)
    assert.equal(result.verdict, 'revoked')
    assert.equal(result.checks.revocation, 'fail')
  })

  it('reports an expired attestation', async () => {
    const at = '2027-06-01T00:00:00.000Z'
    const { config } = setup({}, { now: () => new Date(at) })
    const result = await verify(await signedRequest(at), record, config)
    assert.equal(result.verdict, 'expired')
    assert.equal(result.checks.validity, 'fail')
  })

  it('cannot vouch for an attestation no registered issuer anchored', async () => {
    const { config } = setup(neverAnchored)
    const result = await verify(request, record, config)
    assert.equal(result.verdict, 'undetermined')
    assert.equal(result.checks.signature, 'fail')
    assert.equal(result.checks.provenance, 'fail')
    assert.equal(result.checks.revocation, 'unknown')
  })

  it('fails provenance when the anchor names another issuer', async () => {
    const { config } = setup({ issuerId: `0x${'ab'.repeat(16)}` })
    const result = await verify(request, record, config)
    assert.equal(result.verdict, 'undetermined')
    assert.equal(result.checks.provenance, 'fail')
  })

  it('fails integrity when the shared value was changed', async () => {
    const { config } = setup()
    const tampered = { ...record, value: { type: 'boolean', value: false } }
    const result = await verify(request, tampered, config)
    assert.equal(result.verdict, 'undetermined')
    assert.equal(result.checks.integrity, 'fail')
  })

  it('answers a request id once', async () => {
    const { config } = setup()
    assert.equal((await verify(request, record, config)).verdict, 'authentic')
    const replayed = await verify(request, record, config)
    assert.equal(replayed.verdict, 'undetermined')
    assert.equal(replayed.checks.replay, 'fail')
  })

  it('refuses a stale request, an altered one and one for another chain', async () => {
    const stale = setup({}, { now: () => new Date('2026-11-06T10:20:00.000Z') })
    const createdAt = '2026-11-06T10:00:00.000Z'
    const cases = [
      [request, stale.config],
      [
        await signedRequest(createdAt, { purpose: 'Something the requester never signed' }),
        setup().config,
      ],
      [
        await signedRequest(createdAt, {
          proof: { type: 'EIP712', chainId: 1, signature: request.proof.signature },
        }),
        setup().config,
      ],
    ] as const
    for (const [input, config] of cases) {
      assert.equal((await verify(input, record, config)).checks.replay, 'fail')
    }
  })

  it('stays undetermined when the chain cannot be read', async () => {
    const { config } = setup(new Error('RPC unreachable'))
    const result = await verify(request, record, config)
    assert.equal(result.verdict, 'undetermined')
    assert.deepEqual(
      [
        result.checks.signature,
        result.checks.provenance,
        result.checks.integrity,
        result.checks.revocation,
      ],
      ['unknown', 'unknown', 'unknown', 'unknown'],
    )
  })

  it('treats a class A claim as a declaration', async () => {
    const { config } = setup()
    const claim = { ...fixtures.valid.ExtractedClaim, attribute: request.attribute }
    const result = await verify(request, claim, config)
    assert.equal(result.verdict, 'declared')
    assert.equal(result.attestationId, undefined)
    assert.equal(result.checks.replay, 'pass')
  })

  it('sends a class C claim back to its AttestationRecord', async () => {
    const { config } = setup()
    const claim = {
      ...fixtures.valid.ExtractedClaim,
      document: {
        ...fixtures.valid.ExtractedClaim.document,
        provenance: { class: 'C', attestationId: record.attestationId, issuerId: record.issuerId },
      },
    }
    await assert.rejects(verify(request, claim, config), TypeError)
  })
})
