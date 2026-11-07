import { sepolia } from 'viem/chains'

/** The chain Glimpse sessions are bound to, and the one the contracts are deployed on. */
export const appChain = sepolia

/**
 * AttestationRegistry the requester's verifier reads. The deployment in
 * contracts/ignition/deployments/chain-84532 is on Base Sepolia, not on appChain: until both
 * agree, attestations read as undetermined. Declarations (classes A and B) need no chain read.
 */
export const attestationRegistry = (process.env.NEXT_PUBLIC_ATTESTATION_REGISTRY ??
  '0xE481E72D9aBe5B4a43405B2C58cAA972d0a6dDd6') as `0x${string}`
