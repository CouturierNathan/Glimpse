import { importAttributes } from '@/lib/vault/attributes.ts'
import { errorResponse, noStore, readLimitedBody, vaultErrorResponse } from '@/lib/vault/http.ts'
import { consents, requireHolder } from '@/lib/vault/server.ts'

const OPAQUE_ID = /^[0-9a-f]{32}$/
const known = new Set(importAttributes.map((a) => a.attribute))

/**
 * Records the holder's consent to read the listed attributes from one document. The extraction
 * service reads it back from the server store; the extract request itself cannot grant it.
 */
export async function POST(request: Request) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure

  try {
    const body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 4096))) as {
      documentId?: unknown
      attributes?: unknown
    }
    const { documentId, attributes } = body
    if (
      typeof documentId !== 'string' ||
      !OPAQUE_ID.test(documentId) ||
      !Array.isArray(attributes) ||
      attributes.length === 0 ||
      new Set(attributes).size !== attributes.length ||
      !attributes.every((a): a is string => typeof a === 'string' && known.has(a))
    ) {
      return errorResponse(400, 'Choose at least one attribute to extract.')
    }
    consents.grant({ holderId: holder.holderId, documentId, documentVersion: 1, attributes })
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse(400, 'The request was malformed.')
    return vaultErrorResponse(error)
  }
}
