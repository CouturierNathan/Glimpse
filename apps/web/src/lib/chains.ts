import { baseSepolia } from 'viem/chains'

/**
 * The chain Glimpse sessions are bound to, and the one the contracts are deployed on
 * (contracts/ignition/deployments/chain-84532).
 */
export const appChain = baseSepolia

/**
 * The RPC the app reads and sends through. Unset, viem's public Base Sepolia endpoint. A local
 * test chain with the same chain id (`npm run chain:local -w contracts`) can stand in for it.
 */
export const appRpc = process.env.NEXT_PUBLIC_RPC_URL || undefined

/** AttestationRegistry the requester's verifier reads and the issuer portal anchors in. */
export const attestationRegistry = (process.env.NEXT_PUBLIC_ATTESTATION_REGISTRY ??
  '0xE481E72D9aBe5B4a43405B2C58cAA972d0a6dDd6') as `0x${string}`

/** IssuerRegistry the issuer portal registers organisations in. */
export const issuerRegistry = (process.env.NEXT_PUBLIC_ISSUER_REGISTRY ??
  '0x07Ee362e4FFA3c6c21cBB41eb545FA45c16CF9ee') as `0x${string}`

/** Block of the registries' deployment: the indexer starts there. */
export const registriesDeployedAt = BigInt(
  process.env.NEXT_PUBLIC_REGISTRIES_DEPLOYED_AT ?? '55053387',
)

/**
 * RPC the portal indexes events through. https://sepolia.base.org caps eth_getLogs at 200
 * blocks, which means thousands of calls since the deployment; this one accepts 50,000.
 */
export const indexRpc =
  process.env.NEXT_PUBLIC_INDEX_RPC ?? 'https://base-sepolia-rpc.publicnode.com'
export const INDEX_STEP = 50_000n
