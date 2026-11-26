import { findBundle, isRequesterCall } from '@/lib/requests-http.ts'
import { bundleView, type Role } from '@/lib/requests.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { optionalHolder, requests } from '@/lib/vault/server.ts'

/**
 * The request behind a link. Anyone may read what is asked and by whom, without signing in: no
 * value is ever part of it. The requester (proving its key) and the holder who answered also see
 * where each piece stands.
 */
export async function GET(request: Request, { params }: RouteContext<'/api/requests/[requestId]'>) {
  try {
    const bundle = findBundle((await params).requestId)
    let role: Role = 'visitor'
    if (await isRequesterCall(request, bundle)) role = 'requester'
    else {
      const holder = await optionalHolder()
      if (holder && bundle.holderId === holder.holderId) role = 'holder'
    }
    return Response.json(bundleView(bundle, requests, role), { headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
