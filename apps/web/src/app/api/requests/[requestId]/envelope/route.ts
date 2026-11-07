import type { ItemExpectation } from '@glimpse/vault'

import { findRequest, readJson } from '@/lib/requests-http.ts'
import { RequestError } from '@/lib/requests.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requests, requireHolder, shareService } from '@/lib/vault/server.ts'

type Context = RouteContext<'/api/requests/[requestId]/envelope'>

const OPAQUE_ID = /^[0-9a-f]{32}$/

function isExpectation(value: unknown): value is ItemExpectation {
  const v = value as Record<string, unknown> | null
  return (
    !!v &&
    typeof v === 'object' &&
    ['itemId', 'keyId', 'grantId'].every((k) => typeof v[k] === 'string' && OPAQUE_ID.test(v[k])) &&
    Number.isSafeInteger(v.itemVersion) &&
    (v.sourceClass === 'A' || v.sourceClass === 'B' || v.sourceClass === 'C') &&
    typeof v.recordDigest === 'string' &&
    /^[0-9a-f]{64}$/.test(v.recordDigest)
  )
}

/**
 * Publishes the key envelope the holder's browser wrapped for the requester, with the holder's
 * creation-time pins so the requester can check the item it decrypts.
 */
export async function POST(request: Request, { params }: Context) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure
  const { requestId } = await params
  try {
    const stored = findRequest(requestId)
    if (stored.holderId !== holder.holderId || !stored.shareReference) {
      throw new RequestError(409, 'Nothing to share for this request.')
    }
    const body = (await readJson(request)) as { envelope?: unknown; expected?: unknown }
    if (!isExpectation(body.expected)) throw new RequestError(400, 'The request was malformed.')

    await (await shareService()).publish(stored.shareReference, body.envelope)
    requests.shared(requestId, body.expected)
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
