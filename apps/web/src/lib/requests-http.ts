import { RequestError, type StoredRequest } from '@/lib/requests.ts'
import { readLimitedBody } from '@/lib/vault/http.ts'
import { requests } from '@/lib/vault/server.ts'

export { isRequester, requestView } from '@/lib/requests.ts'

const OPAQUE_ID = /^[0-9a-f]{32}$/

/** The stored request, or a 404 for an unknown or malformed id. */
export function findRequest(requestId: string): StoredRequest {
  const stored = OPAQUE_ID.test(requestId) ? requests.get(requestId) : null
  if (!stored) throw new RequestError(404, 'This request does not exist.')
  return stored
}

/** A small JSON body, read with a byte cap. */
export async function readJson(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const text = new TextDecoder().decode(await readLimitedBody(request, maxBytes))
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new RequestError(400, 'The request was malformed.')
  }
}
