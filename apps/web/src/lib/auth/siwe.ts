import { type Address, type Client, type Hex, isHex, verifyMessage } from 'viem'
import { parseSiweMessage, validateSiweMessage, verifySiweMessage } from 'viem/siwe'

export const NONCE_COOKIE = 'glimpse_siwe_nonce'
/** How long a signed SIWE message stays usable. */
export const SIWE_MESSAGE_TTL_MS = 10 * 60 * 1000
/** Tolerated drift between the wallet's clock and the server's. */
const CLOCK_SKEW_MS = 60 * 1000

export interface SiweExpectation {
  /** Host the user is signing in to, e.g. `localhost:3000`. */
  domain: string
  /** Origin of the app, e.g. `http://localhost:3000`. */
  origin: string
  /** Nonce the server issued for this attempt. */
  nonce: string
  chainId: number
}

export interface SiweSignIn {
  message: string
  signature: Hex
}

/** Narrows an untrusted request body to a SIWE sign-in. */
export function parseSignInBody(body: unknown): SiweSignIn | null {
  if (typeof body !== 'object' || body === null) return null
  const { message, signature } = body as Record<string, unknown>
  if (typeof message !== 'string' || message.length > 4096) return null
  if (typeof signature !== 'string' || !isHex(signature)) return null
  return { message, signature }
}

/**
 * Checks a SIWE message and its signature against what this server expects: domain, origin,
 * nonce, chain and lifetime. Returns the signer, or `null` if anything is off.
 *
 * `client` is only used to verify smart contract wallets (ERC-1271 / ERC-6492); EOA signatures
 * are recovered locally.
 */
export async function verifySignIn(
  client: Client,
  { message, signature }: SiweSignIn,
  expected: SiweExpectation,
  now = new Date(),
): Promise<Address | null> {
  const parsed = parseSiweMessage(message)
  if (!parsed.address || !parsed.uri || !parsed.issuedAt || !parsed.expirationTime) return null
  if (parsed.chainId !== expected.chainId) return null
  if (!URL.canParse(parsed.uri) || new URL(parsed.uri).origin !== expected.origin) return null
  if (parsed.issuedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) return null
  if (parsed.expirationTime.getTime() - parsed.issuedAt.getTime() > SIWE_MESSAGE_TTL_MS) {
    return null
  }

  const fields = { domain: expected.domain, nonce: expected.nonce, time: now }
  if (!validateSiweMessage({ ...fields, message: parsed })) return null

  // Most wallets are EOAs: recover the signer locally, without an RPC call.
  const signer = parsed.address
  if (await verifyMessage({ address: signer, message, signature }).catch(() => false)) {
    return signer
  }

  try {
    // Otherwise it may be a smart contract wallet, which only the chain can vouch for.
    return (await verifySiweMessage(client, { ...fields, message, signature })) ? signer : null
  } catch {
    // RPC failure: fail closed.
    return null
  }
}
