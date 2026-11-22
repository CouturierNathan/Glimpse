import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { type Address, createPublicClient, type Hex, http, verifyMessage } from 'viem'

import { appChain } from '@/lib/chains.ts'

import { IdentityReportStore } from './binding.ts'
import { pemCertificates, validatePades } from './pades.ts'

// Kept on globalThis so every route handler, and dev hot reloads, share the same state.
const shared = globalThis as {
  glimpseIdentityReports?: IdentityReportStore
  glimpseTrustAnchors?: Promise<Uint8Array[]>
}
export const identityReports = (shared.glimpseIdentityReports ??= new IdentityReportStore())

/**
 * The CAs whose PAdES signatures Glimpse accepts, a PEM bundle named by PADES_TRUST_ANCHORS
 * (France Identité's CA in production). Unset, nothing is trusted and every signature fails the
 * chain check.
 */
function trustAnchors(): Promise<Uint8Array[]> {
  const path = process.env.PADES_TRUST_ANCHORS
  if (!path) return Promise.resolve([])
  return (shared.glimpseTrustAnchors ??= readFile(resolve(path), 'utf8')
    .then(pemCertificates)
    .catch((error: unknown) => {
      shared.glimpseTrustAnchors = undefined // let the next request retry
      throw error
    }))
}

export async function validateSignedPdf(pdf: Uint8Array) {
  return validatePades(pdf, { trustAnchors: await trustAnchors() })
}

const client = createPublicClient({ chain: appChain, transport: http() })

/** An EIP-191 signature by `address`: recovered locally, through the chain for contract wallets. */
export async function signedBy(address: Address, message: string, signature: Hex) {
  if (await verifyMessage({ address, message, signature }).catch(() => false)) return true
  return client.verifyMessage({ address, message, signature }).catch(() => false)
}
