import type { AuthenticatedHolder } from '@glimpse/vault/server'

import { REQUESTER_PROOF_HEADER, verifyRequesterProof } from '@/lib/request-proof.ts'
import {
  type OpenBundle,
  type RequestBundle,
  RequestError,
  type StoredRequest,
} from '@/lib/requests.ts'
import { readLimitedBody } from '@/lib/vault/http.ts'
import { requests } from '@/lib/vault/server.ts'

/** A piece, its stored state and its bundle, or a 404 for an unknown or malformed id. */
export async function findRequest(
  requestId: string,
): Promise<OpenBundle & { stored: StoredRequest }> {
  const opened = await requests.openPiece(requestId)
  const stored = opened?.store.get(requestId)
  if (!opened || !stored) throw new RequestError(404, 'This request does not exist.')
  return { ...opened, stored }
}

export async function findBundle(bundleId: string): Promise<OpenBundle> {
  const opened = await requests.open(bundleId)
  if (!opened) throw new RequestError(404, 'This request does not exist.')
  return opened
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
