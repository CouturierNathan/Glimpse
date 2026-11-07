import { appChain } from '@/lib/chains.ts'
import { readJson } from '@/lib/requests-http.ts'
import { validateRequest } from '@/lib/requests.ts'
import { importAttributes } from '@/lib/vault/attributes.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requests, requireHolder } from '@/lib/vault/server.ts'

const attributes = new Set(importAttributes.map((a) => a.attribute))

/**
 * Stores a verification request the signed-in requester signed with its wallet. The reply is the
 * id to put in the link the requester hands to the holder.
 */
export async function POST(request: Request) {
  const { holder, session, failure } = await requireHolder()
  if (failure) return failure
  try {
    const verificationRequest = await validateRequest(await readJson(request), {
      sessionAddress: session.address,
      chainId: appChain.id,
      recipientId: holder.holderId,
      recipientKeyIds: holder.encryptionKeyIds,
      attributes,
    })
    requests.add(verificationRequest)
    return Response.json(
      { requestId: verificationRequest.requestId },
      { status: 201, headers: noStore },
    )
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
