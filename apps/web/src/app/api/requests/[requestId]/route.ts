import { findRequest, requestView } from '@/lib/requests-http.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requireHolder } from '@/lib/vault/server.ts'

/** The request behind a link, as the signed-in visitor may see it. */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/requests/[requestId]'>,
) {
  const { holder, session, failure } = await requireHolder()
  if (failure) return failure
  try {
    const stored = findRequest((await params).requestId)
    return Response.json(requestView(stored, session, holder.holderId), { headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
