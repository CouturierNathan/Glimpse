import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

import { type Address, createPublicClient, type Hex, http, verifyMessage } from 'viem'

import { appChain } from '@/lib/chains.ts'
import { derivedKey } from '@/lib/state/server.ts'
import { stateStore } from '@/lib/vault/server.ts'

import { IdentityReportStore } from './binding.ts'
import {
  fingerprintName,
  type HolderName,
  namesMatch,
  pdfTextLines,
  readHolderName,
} from './holder-name.ts'
import { pemCertificates, validatePades } from './pades.ts'

// Kept on globalThis so every route handler, and dev hot reloads, share the same state.
const shared = globalThis as {
  glimpseTrustAnchors?: Promise<Uint8Array[]>
}
export const identityReports = new IdentityReportStore(stateStore)
/**
 * Keys the name fingerprints. Derived from the server secret: the same on every instance and
 * after a restart, so a verified identity still matches, and meaningless without the secret.
 */
const nameKey = () => new Uint8Array(derivedKey('name-fingerprint'))

/** Where the FAKE test documents live; see tests/fixtures/documents/README.md. */
const TEST_DOCUMENTS = 'tests/fixtures/documents'
/** Every FAKE test certificate carries this organisation name. */
const TEST_AUTHORITY = new TextEncoder().encode('FAKE Glimpse Test')

/**
 * Test authorities are never trusted in production unless the deployment opts in explicitly, as a
 * public demo does. A test document then still proves nothing about a real person.
 */
export function testAuthoritiesAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.GLIMPSE_ALLOW_TEST_AUTHORITIES === '1'
}

function isTestAuthority(certificate: Uint8Array): boolean {
  outer: for (let i = 0; i <= certificate.length - TEST_AUTHORITY.length; i++) {
    for (let j = 0; j < TEST_AUTHORITY.length; j++) {
      if (certificate[i + j] !== TEST_AUTHORITY[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * The PEM bundle, read relative to the app, then to the repository root. The FAKE CA's earlier
 * locations (`fixtures/identity/`, `public/demo/`) still resolve, so a deployment configured
 * before the test documents moved keeps working.
 */
async function readBundle(path: string): Promise<string> {
  const candidates = [resolve(path), resolve(process.cwd(), '../..', path)]
  if (basename(path) === 'FAKE-test-ca.pem') {
    candidates.push(resolve(process.cwd(), '../..', TEST_DOCUMENTS, 'FAKE-test-ca.pem'))
  }
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf8')
    } catch {
      // Try the next place.
    }
  }
  throw new Error('PADES_TRUST_ANCHORS names a file that does not exist.')
}

/**
 * The CAs whose PAdES signatures Glimpse accepts, a PEM bundle named by PADES_TRUST_ANCHORS
 * (France Identité's CA in production). Unset, nothing is trusted and every signature fails the
 * chain check.
 */
function trustAnchors(): Promise<Uint8Array[]> {
  const path = process.env.PADES_TRUST_ANCHORS
  if (!path) return Promise.resolve([])
  return (shared.glimpseTrustAnchors ??= readBundle(path)
    .then(pemCertificates)
    .then((anchors) =>
      testAuthoritiesAllowed() ? anchors : anchors.filter((anchor) => !isTestAuthority(anchor)),
    )
    .catch((error: unknown) => {
      shared.glimpseTrustAnchors = undefined // let the next request retry
      throw error
    }))
}

/** The fingerprinted name a proof states, or `undefined` when it cannot be read. */
export function proofHolderName(pdf: Uint8Array): HolderName | undefined {
  const name = readHolderName(pdfTextLines(pdf))
  return name ? fingerprintName(name, nameKey()) : undefined
}

/** Whether a document's full name names the holder whose identity was verified. */
export function namesVerifiedHolder(verified: HolderName, documentName: string): boolean {
  return namesMatch(verified, documentName, nameKey())
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
