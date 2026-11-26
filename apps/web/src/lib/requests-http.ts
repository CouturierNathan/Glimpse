import type { AuthenticatedHolder } from '@glimpse/vault/server'

import { REQUESTER_PROOF_HEADER, verifyRequesterProof } from '@/lib/request-proof.ts'
import { type RequestBundle, RequestError, type StoredRequest } from '@/lib/requests.ts'
import { readLimitedBody } from '@/lib/vault/http.ts'
import { bundles, requests } from '@/lib/vault/server.ts'

const OPAQUE_ID = /^[0-9a-f]{32}$/

/** The stored request and its bundle, or a 404 for an unknown or malformed id. */
export function findRequest(requestId: string): { stored: StoredRequest; bundle: RequestBundle } {
  const stored = OPAQUE_ID.test(requestId) ? requests.get(requestId) : null
  const bundle = stored ? bundles.ofRequest(requestId) : null
  if (!stored || !bundle) throw new RequestError(404, 'This request does not exist.')
  return { stored, bundle }
}

export function findBundle(bundleId: string): RequestBundle {
  const bundle = OPAQUE_ID.test(bundleId) ? bundles.get(bundleId) : null
  if (!bundle) throw new RequestError(404, 'This request does not exist.')
  return bundle
}

/** Whether the call carries a fresh proof that it comes from the bundle's requester. */
export function isRequesterCall(request: Request, bundle: RequestBundle): Promise<boolean> {
  return verifyRequesterProof(
    request.headers.get(REQUESTER_PROOF_HEADER),
    bundle.bundleId,
    bundle.requester,
  )
}

/** The requester as the share service sees a caller: the recipient the answers are wrapped for. */
export function requesterCaller(bundle: RequestBundle): () => Promise<AuthenticatedHolder> {
  return () =>
    Promise.resolve({
      holderId: bundle.recipientId,
      encryptionKeyIds: [bundle.recipientKeyId],
      expiresAt: Date.now() + 60_000,
    })
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
