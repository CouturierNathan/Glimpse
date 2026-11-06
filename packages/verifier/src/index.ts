import {
  isAddressEqual,
  parseAbi,
  verifyTypedData,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import {
  isContract,
  parseContract,
  type CheckOutcome,
  type VerificationRequest,
  type VerificationResult,
} from '@glimpse/shared'
import { attestationCommitment, attestationDomain, attestationTypes } from './attestation.ts'

export * from './attestation.ts'

/** EIP-712 struct the requester signs, as documented in @glimpse/shared. */
export const requestTypes = {
  VerificationRequest: [
    { name: 'requestId', type: 'bytes16' },
    { name: 'requester', type: 'address' },
    { name: 'attribute', type: 'string' },
    { name: 'purpose', type: 'string' },
    { name: 'recipientId', type: 'bytes16' },
    { name: 'recipientKeyId', type: 'bytes16' },
    { name: 'createdAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
  ],
} as const

export function requestDomain(chainId: number) {
  return { name: 'Glimpse', version: '1', chainId } as const
}

const seconds = (timestamp: string) => BigInt(Date.parse(timestamp) / 1000)
const hex = (id: string) => `0x${id}` as Hex

/** The typed-data message of a request, for signing it and for checking its signature. */
export function requestMessage(request: Omit<VerificationRequest, 'schemaVersion' | 'proof'>) {
  return {
    requestId: hex(request.requestId),
    requester: request.requester as Address,
    attribute: request.attribute,
    purpose: request.purpose,
    recipientId: hex(request.recipientId),
    recipientKeyId: hex(request.recipientKeyId),
    createdAt: seconds(request.createdAt),
    expiresAt: seconds(request.expiresAt),
  }
}

const registryAbi = parseAbi([
  'struct Anchor { bytes16 issuerId; address signer; uint64 issuedAt; uint64 expiresAt; uint64 revokedAt; bytes32 commitment; }',
  'function getAnchor(bytes16 attestationId) view returns (Anchor)',
])

export interface VerifierConfig {
  /** Read access to the chain through any RPC: no Glimpse server is asked anything. */
  client: Pick<PublicClient, 'readContract'>
  chainId: number
  attestationRegistry: Address
  /** The requester's own policy, kept apart from authenticity. */
  trustedIssuers: readonly string[]
  /** Request ids already answered: the requester's replay store. */
  answered: Set<string>
  now?: () => Date
}

const holds = (check: Promise<boolean>) => check.catch(() => false)
const outcome = (ok: boolean): CheckOutcome => (ok ? 'pass' : 'fail')

/**
 * Checks what a holder shared in answer to a request: a class C AttestationRecord against the
 * chain, or a class A or B claim, which stays a declaration.
 */
export async function verify(
  requestInput: unknown,
  item: unknown,
  config: VerifierConfig,
): Promise<VerificationResult> {
  const request = parseContract('VerificationRequest', requestInput)
  const now = (config.now ?? (() => new Date()))().getTime()
  const checkedAt = new Date(Math.floor(now / 1000) * 1000).toISOString()
  const requestSigned =
    request.proof.chainId === config.chainId &&
    (await holds(
      verifyTypedData({
        address: request.requester as Address,
        domain: requestDomain(request.proof.chainId),
        types: requestTypes,
        primaryType: 'VerificationRequest',
        message: requestMessage(request),
        signature: request.proof.signature as Hex,
      }),
    ))
  const replay = outcome(
    requestSigned &&
      Date.parse(request.createdAt) <= now &&
      now < Date.parse(request.expiresAt) &&
      !config.answered.has(request.requestId),
  )
  if (replay === 'pass') config.answered.add(request.requestId)

  if (!isContract('AttestationRecord', item)) {
    const claim = parseContract('ExtractedClaim', item)
    if (claim.document.provenance.class === 'C') {
      throw new TypeError('A class C claim is verified through its AttestationRecord')
    }
    return parseContract('VerificationResult', {
      schemaVersion: '1.0.0',
      requestId: request.requestId,
      verdict: 'declared',
      checks: {
        signature: 'unknown',
        provenance: claim.attribute === request.attribute ? 'unknown' : 'fail',
        integrity: 'unknown',
        validity: 'unknown',
        revocation: 'unknown',
        replay,
      },
      issuerTrusted: false,
      checkedAt,
    })
  }

  const record = parseContract('AttestationRecord', item)
  const message = {
    attestationId: hex(record.attestationId),
    issuerId: hex(record.issuerId),
    commitment: record.commitment as Hex,
    issuedAt: seconds(record.issuedAt),
    expiresAt: seconds(record.expiresAt),
  }
  const validity = outcome(Date.parse(record.issuedAt) <= now && now < Date.parse(record.expiresAt))
  const committed =
    attestationCommitment({
      salt: record.salt as Hex,
      attestationId: message.attestationId,
      holder: record.holder as Address,
      attribute: record.attribute,
      value: record.value,
    }) === message.commitment

  // An unreadable chain leaves the chain checks unknown: nothing is decided on the holder's word.
  const anchor = await config.client
    .readContract({
      address: config.attestationRegistry,
      abi: registryAbi,
      functionName: 'getAnchor',
      args: [message.attestationId],
    })
    .catch(() => undefined)
  let checks: VerificationResult['checks']
  if (anchor === undefined) {
    checks = {
      signature: 'unknown',
      provenance: 'unknown',
      integrity: committed ? 'unknown' : 'fail',
      validity,
      revocation: 'unknown',
      replay,
    }
  } else {
    // getAnchor returns zeros for an attestation that was never anchored.
    const known = anchor.signer !== zeroAddress
    checks = {
      signature: outcome(
        known &&
          (await holds(
            verifyTypedData({
              address: anchor.signer,
              domain: attestationDomain(
                record.proof.chainId,
                record.proof.verifyingContract as Address,
              ),
              types: attestationTypes,
              primaryType: 'Attestation',
              message,
              signature: record.proof.signature as Hex,
            }),
          )),
      ),
      provenance: outcome(
        known &&
          anchor.issuerId === message.issuerId &&
          record.proof.chainId === config.chainId &&
          isAddressEqual(record.proof.verifyingContract as Address, config.attestationRegistry) &&
          record.attribute === request.attribute,
      ),
      integrity: outcome(
        committed &&
          anchor.commitment === message.commitment &&
          anchor.issuedAt === message.issuedAt &&
          anchor.expiresAt === message.expiresAt,
      ),
      validity,
      revocation: known ? outcome(anchor.revokedAt === 0n) : 'unknown',
      replay,
    }
  }
  const { signature, provenance, integrity, revocation } = checks
  const decided = [signature, provenance, integrity, replay].every((check) => check === 'pass')
  const verdict =
    !decided || revocation === 'unknown'
      ? 'undetermined'
      : revocation === 'fail'
        ? 'revoked'
        : validity === 'fail'
          ? 'expired'
          : 'authentic'
  return parseContract('VerificationResult', {
    schemaVersion: '1.0.0',
    requestId: request.requestId,
    attestationId: record.attestationId,
    issuerId: record.issuerId,
    verdict,
    checks,
    issuerTrusted: config.trustedIssuers.includes(record.issuerId),
    checkedAt,
  })
}
