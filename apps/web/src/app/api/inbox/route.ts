import { isAddress } from 'viem'

import { getSession } from '@/lib/auth/server.ts'
import { readJson } from '@/lib/requests-http.ts'
import { RequestError } from '@/lib/requests.ts'
import { noStore, signedOut, vaultErrorResponse } from '@/lib/vault/http.ts'
import { holders, inbox, requireHolder } from '@/lib/vault/server.ts'

/** For the holder: the attestations waiting for their vault, still encrypted. */
export async function GET() {
  const { holder, failure } = await requireHolder()
  if (failure) return failure
  return Response.json(await inbox.list(holder.holderId), { headers: noStore })
}

/**
 * For a signed-in organisation: delivers an attestation it encrypted for the holder's keys. The
 * holder's browser checks it before keeping it; the server only holds the ciphertext.
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return signedOut()
  try {
    const body = (await readJson(request, 300 * 1024)) as { holder?: unknown; items?: unknown }
    if (
      typeof body.holder !== 'string' ||
      !isAddress(body.holder) ||
      !Array.isArray(body.items) ||
      !body.items.every((i) => typeof i === 'string')
    ) {
      throw new RequestError(400, 'The request was malformed.')
    }
    await inbox.deliver(holders.ensure(body.holder, session.chainId), body.items as string[])
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
