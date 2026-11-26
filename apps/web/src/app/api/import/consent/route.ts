import { identityReports } from '@/lib/identity/server.ts'
import { readUploadRequest } from '@/lib/vault/attributes.ts'
import { errorResponse, noStore, readLimitedBody, vaultErrorResponse } from '@/lib/vault/http.ts'
import { consents, requireHolder } from '@/lib/vault/server.ts'

/**
 * Records the holder's consent to read the listed attributes from one document, sent as the
 * shared DocumentUploadRequest. The extraction service reads it back from the server store; the
 * extract request itself cannot grant it.
 */
export async function POST(request: Request) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure

  try {
    identityReports.requireVerified(holder.holderId)
    const upload = readUploadRequest(
      JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 4096))),
    )
    if (!upload) return errorResponse(400, 'Choose at least one attribute to extract.')
    const { documentId, documentVersion, attributes } = upload
    consents.grant({ holderId: holder.holderId, documentId, documentVersion, attributes })
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse(400, 'The request was malformed.')
    return vaultErrorResponse(error)
  }
}
