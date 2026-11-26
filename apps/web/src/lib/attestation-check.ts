import type { AttestationRecord } from '@glimpse/shared'
import { createPublicClient, type Hex, http, parseAbi, zeroAddress } from 'viem'

import { appChain, attestationRegistry, appRpc } from './chains.ts'

const client = createPublicClient({ chain: appChain, transport: http(appRpc) })
const registryAbi = parseAbi([
  'struct Anchor { bytes16 issuerId; address signer; uint64 issuedAt; uint64 expiresAt; uint64 revokedAt; bytes32 commitment; }',
  'function getAnchor(bytes16 attestationId) view returns (Anchor)',
])

/**
 * Where an attestation stands on chain before the holder keeps it: recorded, revoked, never
 * recorded, or unknown when the chain cannot be read. Its full check stays the verifier's job.
 */
export async function anchorStatus(
  record: AttestationRecord,
): Promise<'anchored' | 'revoked' | 'missing' | 'unreadable'> {
  try {
    const anchor = await client.readContract({
      address: attestationRegistry,
      abi: registryAbi,
      functionName: 'getAnchor',
      args: [`0x${record.attestationId}` as Hex],
    })
    if (anchor.signer === zeroAddress) return 'missing'
    return anchor.revokedAt === 0n ? 'anchored' : 'revoked'
  } catch {
    return 'unreadable'
  }
}
