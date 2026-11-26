import type {
  AttestationRecord,
  ExtractedClaim,
  VerificationRequest,
  VerificationResult,
} from '@glimpse/shared'
import { verify } from '@glimpse/verifier'
import { type Address, createPublicClient, http } from 'viem'

import { appChain, attestationRegistry, appRpc } from './chains.ts'

const client = createPublicClient({ chain: appChain, transport: http(appRpc) })

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

/** The message key of each check the verifier runs, in the order the result lists them. */
export const checkNames = {
  signature: 'check.signature',
  provenance: 'check.provenance',
  integrity: 'check.integrity',
  validity: 'check.validity',
  revocation: 'check.revocation',
  replay: 'check.replay',
} as const satisfies Record<keyof VerificationResult['checks'], string>

export const outcomeNames = {
  pass: 'outcome.pass',
  fail: 'outcome.fail',
  unknown: 'outcome.unknown',
} as const
