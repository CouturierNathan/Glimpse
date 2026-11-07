import { isContract, parseContract, type VerificationRequest } from '@glimpse/shared'
import type { ItemExpectation } from '@glimpse/vault'
import type { ConsentDecision } from '@glimpse/vault/server'
import { requestDomain, requestMessage, requestTypes } from '@glimpse/verifier'
import { type Address, type Hex, isAddressEqual, verifyTypedData } from 'viem'

import { MAX_PURPOSE_LENGTH, MAX_REQUEST_LIFETIME_MS } from './request-limits.ts'

/**
 * Where a request stands. `allowed` means the holder consented and the grant exists, but the
 * holder's browser has not published the requester's key envelope yet.
 */
export type RequestState = 'pending' | 'refused' | 'allowed' | 'shared' | 'withdrawn' | 'expired'

export interface StoredRequest {
  request: VerificationRequest
  state: RequestState
  /** Set once the holder answers: whose item it is and which one. */
  holderId?: string
  itemId?: string
  itemVersion?: number
  shareReference?: string
  /** The holder's creation-time pins, relayed so the requester can check what it decrypts. */
  expected?: ItemExpectation
}

export class RequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

/**
 * Checks a request before it is stored: well formed, signed by the signed-in requester's wallet
 * on the app chain, short-lived, for a known attribute, and addressed to a key the requester
 * registered. A Glimpse server never answers on the holder's behalf; it only routes requests.
 */
export async function validateRequest(
  input: unknown,
  context: {
    sessionAddress: string
    chainId: number
    recipientId: string
    recipientKeyIds: readonly string[]
    attributes: ReadonlySet<string>
    now?: number
  },
): Promise<VerificationRequest> {
  let request: VerificationRequest
  try {
    // The schema check, then the shared semantic rules (e.g. it must end after it starts).
    if (!isContract('VerificationRequest', input)) throw new Error()
    request = parseContract('VerificationRequest', input)
  } catch {
    throw new RequestError(400, 'The request is malformed.')
  }
  const now = context.now ?? Date.now()
  const createdAt = Date.parse(request.createdAt)
  const expiresAt = Date.parse(request.expiresAt)

  if (!isAddressEqual(request.requester as Address, context.sessionAddress as Address)) {
    throw new RequestError(403, 'Sign the request with the wallet you are signed in with.')
  }
  if (request.proof.chainId !== context.chainId) {
    throw new RequestError(400, 'The request is signed for another chain.')
  }
  if (!context.attributes.has(request.attribute)) {
    throw new RequestError(400, 'This attribute cannot be requested.')
  }
  if (request.purpose.trim().length === 0 || request.purpose.length > MAX_PURPOSE_LENGTH) {
    throw new RequestError(400, `Say why you need it, in ${MAX_PURPOSE_LENGTH} characters or less.`)
  }
  if (
    createdAt > now + 60_000 ||
    expiresAt <= now ||
    expiresAt - createdAt > MAX_REQUEST_LIFETIME_MS
  ) {
    throw new RequestError(400, 'The request must be valid for one hour at most, starting now.')
  }
  if (
    request.recipientId !== context.recipientId ||
    !context.recipientKeyIds.includes(request.recipientKeyId)
  ) {
    throw new RequestError(400, 'The request must name an encryption key you registered.')
  }
  const signed = await verifyTypedData({
    address: request.requester as Address,
    domain: requestDomain(request.proof.chainId),
    types: requestTypes,
    primaryType: 'VerificationRequest',
    message: requestMessage(request),
    signature: request.proof.signature as Hex,
  }).catch(() => false)
  if (!signed) throw new RequestError(400, 'The request signature does not match the requester.')
  return request
}

/** Requests and the holders' answers, in memory: a server restart forgets them. */
export class RequestStore {
  readonly #requests = new Map<string, StoredRequest>()

  add(request: VerificationRequest): void {
    if (this.#requests.has(request.requestId)) {
      throw new RequestError(409, 'This request already exists.')
    }
    this.#requests.set(request.requestId, { request, state: 'pending' })
  }

  /** The request with its current state; a pending request past its end date reads as expired. */
  get(requestId: string, now = Date.now()): StoredRequest | null {
    const stored = this.#requests.get(requestId)
    if (!stored) return null
    if (stored.state === 'pending' && Date.parse(stored.request.expiresAt) <= now) {
      stored.state = 'expired'
    }
    return stored
  }

  /** The holder answers once. A refusal is final; so is a consent. */
  decide(
    requestId: string,
    holderId: string,
    answer: { outcome: 'deny' } | { outcome: 'allow'; itemId: string; itemVersion: number },
    now = Date.now(),
  ): StoredRequest {
    const stored = this.get(requestId, now)
    if (!stored) throw new RequestError(404, 'This request does not exist.')
    if (stored.state === 'expired') throw new RequestError(410, 'This request has expired.')
    if (stored.state !== 'pending') {
      throw new RequestError(409, 'This request was already answered.')
    }
    stored.holderId = holderId
    if (answer.outcome === 'deny') {
      stored.state = 'refused'
    } else {
      stored.state = 'allowed'
      stored.itemId = answer.itemId
      stored.itemVersion = answer.itemVersion
    }
    return stored
  }

  /** Undoes a consent whose grant could not be created, so the holder can answer again. */
  reopen(requestId: string): void {
    const stored = this.#requests.get(requestId)
    if (stored?.state !== 'allowed' || stored.shareReference) return
    stored.state = 'pending'
    delete stored.holderId
    delete stored.itemId
    delete stored.itemVersion
  }

  /** The live consent the share service checks on every step, never taken from a request body. */
  readDecision(requestId: string): ConsentDecision | null {
    const stored = this.#requests.get(requestId)
    if (
      !stored ||
      (stored.state !== 'allowed' && stored.state !== 'shared') ||
      !stored.holderId ||
      !stored.itemId ||
      stored.itemVersion === undefined
    ) {
      return null
    }
    return {
      outcome: 'allow',
      holderId: stored.holderId,
      recipientId: stored.request.recipientId,
      recipientKeyId: stored.request.recipientKeyId,
      itemId: stored.itemId,
      itemVersion: stored.itemVersion,
      consentRequestId: requestId,
      expiresAt: stored.request.expiresAt,
    }
  }

  authorized(requestId: string, shareReference: string): void {
    const stored = this.#requests.get(requestId)
    if (stored) stored.shareReference = shareReference
  }

  shared(requestId: string, expected: ItemExpectation): void {
    const stored = this.#requests.get(requestId)
    if (stored?.state !== 'allowed') {
      throw new RequestError(409, 'Nothing to share for this request.')
    }
    stored.state = 'shared'
    stored.expected = expected
  }

  /** The holder takes the consent back: the requester can no longer download the item. */
  withdraw(requestId: string): void {
    const stored = this.#requests.get(requestId)
    if (stored && (stored.state === 'allowed' || stored.state === 'shared')) {
      stored.state = 'withdrawn'
    }
  }
}
