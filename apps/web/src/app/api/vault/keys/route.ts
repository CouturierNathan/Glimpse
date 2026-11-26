import { getSession } from '@/lib/auth/server.ts'
import { HolderKeyError } from '@/lib/vault/holders.ts'
import {
  errorResponse,
  noStore,
  readLimitedBody,
  signedOut,
  vaultErrorResponse,
} from '@/lib/vault/http.ts'
import { isEncryptionKey } from '@/lib/vault/keys.ts'
import { holders } from '@/lib/vault/server.ts'

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
      !(await isEncryptionKey(publicKey))
    ) {
      return errorResponse(400, 'The public key is not a valid encryption key.')
    }
    await holders.registerKey(session.address, session.chainId, recipientKeyId, publicKey)
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse(400, 'The request was malformed.')
    if (error instanceof HolderKeyError) return errorResponse(409, error.message)
    return vaultErrorResponse(error)
  }
}
