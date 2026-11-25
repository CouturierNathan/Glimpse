import type {
  AttestationRecord,
  ExtractedClaim,
  VerificationRequest,
  VerificationResult,
} from '@glimpse/shared'
import { verify } from '@glimpse/verifier'
import { type Address, createPublicClient, http } from 'viem'

import { appChain, attestationRegistry } from './chains.ts'

const client = createPublicClient({ chain: appChain, transport: http() })

/** The requester's replay store: a request answered once in this tab is not accepted again. */
const answered = new Set<string>()

/**
 * Runs the verifier in the requester's own browser, against the chain through a public RPC.
 * Nothing here asks a Glimpse server whether the item is valid.
 */
export function verifyShared(
  request: VerificationRequest,
  claim: ExtractedClaim | AttestationRecord,
  requester: Address,
): Promise<VerificationResult> {
  return verify(request, claim, {
    client,
    chainId: appChain.id,
    attestationRegistry,
    requester,
    trustedIssuers: [],
    answered,
  })
}

export const checkNames: Record<keyof VerificationResult['checks'], string> = {
  signature: 'Issuer signature',
  provenance: 'Issuer and attribute',
  integrity: 'Content unchanged',
  validity: 'Within its dates',
  revocation: 'Not revoked',
  replay: 'Request answered once',
}

export const outcomeNames = { pass: 'Passed', fail: 'Failed', unknown: 'Not checked' } as const
