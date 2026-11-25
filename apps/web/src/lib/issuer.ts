import { type AttestationRecord, isContract, parseContract } from '@glimpse/shared'
import {
  attestationCommitment,
  attestationDomain,
  attestationTypes,
  type AttestedValue,
  randomBytes,
} from '@glimpse/verifier'
import { type Address, getAddress, type Hex, isAddress, isAddressEqual, parseAbi } from 'viem'

export const issuerRegistryAbi = parseAbi([
  'struct Issuer { address admin; address signer; string metadataURI; }',
  'function register(bytes16 issuerId, address signer, string metadataURI)',
  'function getIssuer(bytes16 issuerId) view returns (Issuer)',
])

export const attestationRegistryAbi = parseAbi([
  'function anchor(bytes16 attestationId, bytes16 issuerId, bytes32 commitment, uint64 issuedAt, uint64 expiresAt, bytes signature)',
  'function revoke(bytes16 attestationId)',
])

const DAY_SECONDS = 24 * 3600
/** An attestation outliving a degree's validity makes little sense; it also bounds typos. */
export const MAX_VALID_DAYS = 5 * 366
const MAX_NAME_LENGTH = 80

export class IssuerInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IssuerInputError'
  }
}

/** The public metadata an issuer registers: its display name only, nothing about a holder. */
export function issuerMetadataURI(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new IssuerInputError(
      `Give the organisation a name of ${MAX_NAME_LENGTH} characters or less.`,
    )
  }
  return `data:application/json,${encodeURIComponent(JSON.stringify({ name: trimmed }))}`
}

/** Reads back the name `issuerMetadataURI` wrote; any other URI shows as itself. */
export function issuerName(metadataURI: string): string {
  const prefix = 'data:application/json,'
  if (!metadataURI.startsWith(prefix)) return metadataURI
  try {
    const raw = metadataURI.slice(prefix.length)
    const parsed: unknown = JSON.parse(raw.startsWith('{') ? raw : decodeURIComponent(raw))
    const name = (parsed as { name?: unknown }).name
    return typeof name === 'string' ? name : metadataURI
  } catch {
    return metadataURI
  }
}

/** Turns what the issuer typed into a typed value, refusing what the type cannot hold. */
export function parseAttestedValue(type: AttestedValue['type'], text: string): AttestedValue {
  const raw = text.trim()
  switch (type) {
    case 'boolean':
      if (raw === 'true' || raw === 'false') return { type, value: raw === 'true' }
      throw new IssuerInputError('Choose yes or no.')
    case 'number': {
      const value = Number(raw)
      if (raw !== '' && Number.isFinite(value)) return { type, value }
      throw new IssuerInputError('Enter a number.')
    }
    case 'date':
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw))) {
        return { type, value: raw }
      }
      throw new IssuerInputError('Enter a date as YYYY-MM-DD.')
    case 'string':
      if (raw !== '') return { type, value: raw }
      throw new IssuerInputError('Enter a value.')
  }
}

export interface AttestationDraft {
  /** The EIP-712 message the issuer's signer signs, and `anchor` takes. */
  message: {
    attestationId: Hex
    issuerId: Hex
    commitment: Hex
    issuedAt: bigint
    expiresAt: bigint
  }
  domain: ReturnType<typeof attestationDomain>
  types: typeof attestationTypes
  /** The record the holder receives once the signature exists. */
  record: (signature: Hex) => AttestationRecord
}

/**
 * Prepares one attestation for a holder: a fresh id and salt, the salted commitment that goes on
 * chain, and the record (with the clear value) that only the holder gets.
 */
export function draftAttestation(input: {
  issuerId: Hex
  holder: string
  attribute: string
  value: AttestedValue
  /** Unix seconds; the chain's clock is the reference. */
  issuedAt: number
  validDays: number
  chainId: number
  attestationRegistry: Address
}): AttestationDraft {
  if (!isAddress(input.holder)) throw new IssuerInputError("Enter the holder's wallet address.")
  if (
    !Number.isInteger(input.validDays) ||
    input.validDays < 1 ||
    input.validDays > MAX_VALID_DAYS
  ) {
    throw new IssuerInputError(`Validity is 1 to ${MAX_VALID_DAYS} days.`)
  }
  const holder = getAddress(input.holder)
  const attestationId = randomBytes(16)
  const salt = randomBytes(32)
  const commitment = attestationCommitment({
    salt,
    attestationId,
    holder,
    attribute: input.attribute,
    value: input.value,
  })
  const issuedAt = BigInt(input.issuedAt)
  const expiresAt = issuedAt + BigInt(input.validDays * DAY_SECONDS)
  const domain = attestationDomain(input.chainId, input.attestationRegistry)
  const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString()
  return {
    message: { attestationId, issuerId: input.issuerId, commitment, issuedAt, expiresAt },
    domain,
    types: attestationTypes,
    record: (signature) =>
      parseContract('AttestationRecord', {
        schemaVersion: '1.0.0',
        attestationId: attestationId.slice(2),
        issuerId: input.issuerId.slice(2),
        holder,
        attribute: input.attribute,
        value: input.value,
        issuedAt: iso(issuedAt),
        expiresAt: iso(expiresAt),
        salt,
        commitment,
        proof: {
          type: 'EIP712',
          chainId: input.chainId,
          verifyingContract: domain.verifyingContract,
          signature,
        },
      }),
  }
}

/**
 * Checks an attestation file before the holder stores it: a well-formed record, for this
 * holder's wallet, issued on the app's chain and registry. Its authenticity is the verifier's job.
 */
export function readAttestationFile(
  text: string,
  context: { holder: Address; chainId: number; attestationRegistry: Address },
): AttestationRecord {
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new IssuerInputError('This file is not an attestation.')
  }
  if (!isContract('AttestationRecord', input)) {
    throw new IssuerInputError('This file is not an attestation.')
  }
  const record = parseContract('AttestationRecord', input)
  if (!isAddressEqual(record.holder as Address, context.holder)) {
    throw new IssuerInputError('This attestation was issued to another wallet.')
  }
  if (
    record.proof.chainId !== context.chainId ||
    !isAddressEqual(record.proof.verifyingContract as Address, context.attestationRegistry)
  ) {
    throw new IssuerInputError('This attestation was issued on another network.')
  }
  return record
}
