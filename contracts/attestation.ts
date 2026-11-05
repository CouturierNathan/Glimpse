import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from 'viem'

/** EIP-712 struct the issuer signs; must match ATTESTATION_TYPEHASH in AttestationRegistry.sol. */
export const attestationTypes = {
  Attestation: [
    { name: 'attestationId', type: 'bytes16' },
    { name: 'issuerId', type: 'bytes16' },
    { name: 'commitment', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
  ],
} as const

export function attestationDomain(chainId: number, verifyingContract: Address) {
  return { name: 'Glimpse', version: '1', chainId, verifyingContract } as const
}

/** Same shape as ClaimValue in @glimpse/shared. */
export type AttestedValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }

export interface AttestationContent {
  salt: Hex
  attestationId: Hex
  holder: Address
  attribute: string
  value: AttestedValue
}

/** Random 16-byte id (bytes16), or 32 bytes for a salt. */
export function randomBytes(size: 16 | 32): Hex {
  return toHex(crypto.getRandomValues(new Uint8Array(size)))
}

/**
 * Salted commitment anchored on chain. Only the holder and the requesters they share with get
 * the salt and the content, so nobody else can test guesses against it.
 */
export function attestationCommitment(content: AttestationContent): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes16' },
        { type: 'address' },
        { type: 'string' },
        { type: 'string' },
        { type: 'string' },
      ],
      [
        content.salt,
        content.attestationId,
        content.holder,
        content.attribute,
        content.value.type,
        JSON.stringify(content.value.value),
      ],
    ),
  )
}
