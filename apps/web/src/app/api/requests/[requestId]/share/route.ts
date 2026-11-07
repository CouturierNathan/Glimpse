import { findRequest, isRequester } from '@/lib/requests-http.ts'
import { RequestError } from '@/lib/requests.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requests, requireHolder, shareService } from '@/lib/vault/server.ts'

type Context = RouteContext<'/api/requests/[requestId]/share'>

/**
 * For the requester: the shared item, still encrypted, with its key envelope for the requester's
 * key. The requester's browser decrypts and verifies it on its own.
 */
export async function GET(_request: Request, { params }: Context) {
  const { session, failure } = await requireHolder()
  if (failure) return failure
  try {
    const stored = findRequest((await params).requestId)
    if (!isRequester(stored, session)) throw new RequestError(403, 'This is not your request.')
    if (stored.state !== 'shared' || !stored.shareReference) {
      throw new RequestError(409, 'The holder has not shared anything for this request.')
    }
    const shared = await (await shareService()).receive(stored.shareReference)
    return Response.json(
      { ...shared, expected: stored.expected, request: stored.request },
      { headers: noStore },
    )
  } catch (error) {
    return vaultErrorResponse(error)
  }
}

/** For the holder: withdraws the consent, so the requester can no longer download the item. */
export async function DELETE(_request: Request, { params }: Context) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure
  const { requestId } = await params
  try {
    const stored = findRequest(requestId)
    if (stored.decision?.holderId !== holder.holderId) {
      throw new RequestError(403, 'Only the holder who answered can withdraw.')
    }
    if (stored.shareReference) await (await shareService()).revoke(stored.shareReference)
    requests.withdraw(requestId)
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
