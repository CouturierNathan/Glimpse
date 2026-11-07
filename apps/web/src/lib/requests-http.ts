import type { Session } from '@/lib/auth/session.ts'
import { RequestError, type StoredRequest } from '@/lib/requests.ts'
import { readLimitedBody } from '@/lib/vault/http.ts'
import { requests } from '@/lib/vault/server.ts'

const OPAQUE_ID = /^[0-9a-f]{32}$/

/** The stored request, or a 404 for an unknown or malformed id. */
export function findRequest(requestId: string): StoredRequest {
  const stored = OPAQUE_ID.test(requestId) ? requests.get(requestId) : null
  if (!stored) throw new RequestError(404, 'This request does not exist.')
  return stored
}

export function isRequester(stored: StoredRequest, session: Session): boolean {
  return stored.request.requester.toLowerCase() === session.address.toLowerCase()
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

/**
 * What a signed-in visitor may see of a request. The requester and the holder who answered see
 * where it stands; anyone else with the link only sees whether it can still be answered.
 */
export function requestView(stored: StoredRequest, session: Session, holderId: string) {
  const { request } = stored
  const role = isRequester(stored, session)
    ? 'requester'
    : stored.holderId === holderId
      ? 'holder'
      : 'visitor'
  const open = stored.state === 'pending' || stored.state === 'expired'
  return {
    requestId: request.requestId,
    requester: request.requester,
    attribute: request.attribute,
    purpose: request.purpose,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    role,
    state: role === 'visitor' && !open ? 'answered' : stored.state,
  }
}
