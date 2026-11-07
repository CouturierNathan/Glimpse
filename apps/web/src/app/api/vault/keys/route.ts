import { getSession } from '@/lib/auth/server.ts'
import { HolderKeyError } from '@/lib/vault/holders.ts'
import {
  errorResponse,
  noStore,
  readLimitedBody,
  signedOut,
  vaultErrorResponse,
} from '@/lib/vault/http.ts'
import { holders } from '@/lib/vault/server.ts'

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** True when the bytes are an RSA-OAEP SHA-256 public key of at least 2048 bits. */
async function isEncryptionKey(spki: Uint8Array<ArrayBuffer>): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      spki,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['wrapKey'],
    )
    return (key.algorithm as RsaHashedKeyAlgorithm).modulusLength >= 2048
  } catch {
    return false
  }
}

/** Registers a public encryption key the browser generated for the signed-in holder. */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return signedOut()

  try {
    const body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 4096))) as {
      recipientKeyId?: unknown
      publicKey?: unknown
    }
    const { recipientKeyId, publicKey } = body
    if (
      typeof recipientKeyId !== 'string' ||
      typeof publicKey !== 'string' ||
      !BASE64URL.test(publicKey) ||
      !(await isEncryptionKey(Uint8Array.from(Buffer.from(publicKey, 'base64url'))))
    ) {
      return errorResponse(400, 'The public key is not a valid encryption key.')
    }
    holders.registerKey(session.address, session.chainId, recipientKeyId, publicKey)
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse(400, 'The request was malformed.')
    if (error instanceof HolderKeyError) return errorResponse(409, error.message)
    return vaultErrorResponse(error)
  }
}
