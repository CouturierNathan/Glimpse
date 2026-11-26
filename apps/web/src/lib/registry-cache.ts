import type { RegistryIndex } from '@glimpse/verifier'
import type { Hex } from 'viem'

import { appChain, attestationRegistry, issuerRegistry, registriesDeployedAt } from './chains.ts'

/*
 * The registry index this browser already read, so the issuer screen only fetches the blocks
 * since its last visit. It holds public chain events only (ids, addresses, dates, commitments)
 * and is a listing aid: verdicts always come from verify(), which reads the chain itself.
 */
export const REGISTRY_KEY = `glimpse-registry-index:${appChain.id}:${issuerRegistry}:${attestationRegistry}:${registriesDeployedAt}`

type Stored = {
  toBlock: string
  issuers: [Hex, { admin: Hex; signer: Hex; metadataURI: string }][]
  attestations: [
    Hex,
    {
      issuerId: Hex
      signer: Hex
      commitment: Hex
      issuedAt: string
      expiresAt: string
      revokedAt: string
    },
  ][]
}

/** The index as JSON text (bigints as strings), for this browser's cache and the server's. */
export function encodeRegistryIndex(index: RegistryIndex): string {
  const stored: Stored = {
    toBlock: index.toBlock.toString(),
    issuers: [...index.issuers],
    attestations: [...index.attestations].map(([id, a]) => [
      id,
      {
        ...a,
        issuedAt: a.issuedAt.toString(),
        expiresAt: a.expiresAt.toString(),
        revokedAt: a.revokedAt.toString(),
      },
    ]),
  }
  return JSON.stringify(stored)
}

export function decodeRegistryIndex(raw: string): RegistryIndex | null {
  try {
    const stored = JSON.parse(raw) as Stored
    return {
      toBlock: BigInt(stored.toBlock),
      issuers: new Map(stored.issuers),
      attestations: new Map(
        stored.attestations.map(([id, a]) => [
          id,
          {
            ...a,
            issuedAt: BigInt(a.issuedAt),
            expiresAt: BigInt(a.expiresAt),
            revokedAt: BigInt(a.revokedAt),
          },
        ]),
      ),
    }
  } catch {
    return null
  }
}

export function loadRegistryIndex(): RegistryIndex | null {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY)
    return raw ? decodeRegistryIndex(raw) : null
  } catch {
    return null
  }
}

export function saveRegistryIndex(index: RegistryIndex): void {
  try {
    localStorage.setItem(REGISTRY_KEY, encodeRegistryIndex(index))
  } catch {
    // Storage full or blocked: the next visit reads the chain again.
  }
}
