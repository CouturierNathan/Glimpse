import {
  type AccessDecision,
  isContract,
  parseContract,
  type VerificationRequest,
} from '@glimpse/shared'
import type { ItemExpectation } from '@glimpse/vault'
import type { ConsentDecision } from '@glimpse/vault/server'
import { requestDomain, requestMessage, requestTypes } from '@glimpse/verifier'
import { type Address, type Hex, isAddressEqual, verifyTypedData } from 'viem'

import {
  MAX_ATTRIBUTES_PER_REQUEST,
  MAX_OPEN_REQUESTS,
  MAX_PURPOSE_LENGTH,
  MAX_REQUEST_LIFETIME_MS,
  MAX_REQUESTER_NAME_LENGTH,
} from './request-limits.ts'

/**
 * Where a request stands. `allowed` means the holder consented and the grant exists, but the
 * holder's browser has not published the requester's key envelope yet.
 */
export type RequestState = 'pending' | 'refused' | 'allowed' | 'shared' | 'withdrawn' | 'expired'

export interface StoredRequest {
  request: VerificationRequest
  state: RequestState
  /** Set once the holder answers, replaced by a deny if the holder withdraws. */
  decision?: AccessDecision
  shareReference?: string
  /** The holder's creation-time pins, relayed so the requester can check what it decrypts. */
  expected?: ItemExpectation
}

export class RequestError extends Error {
  readonly status: number
  /** A stable code the browser acts on, e.g. sending the holder to the identity check. */
  readonly code: string | undefined
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.code = code
  }
}

/**
 * Checks a request before it is stored: well formed, signed by the requester's key on the app
 * chain, short-lived, for a known attribute, and addressed to the requester's encryption key. A
 * Glimpse server never answers on the holder's behalf; it only routes requests.
 */
export async function validateRequest(
  input: unknown,
  context: {
    requester: string
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

  if (!isAddressEqual(request.requester as Address, context.requester as Address)) {
    throw new RequestError(400, 'The request is malformed.')
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
    throw new RequestError(400, 'The request must be valid for seven days at most, starting now.')
  }
  if (
    request.recipientId !== context.recipientId ||
    !context.recipientKeyIds.includes(request.recipientKeyId)
  ) {
    throw new RequestError(400, 'The request is malformed.')
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

type Answer =
  | { outcome: 'deny'; reason?: AccessDecision['reason'] }
  | { outcome: 'allow'; itemId: string; itemVersion: number }

/** The holder's answer as the shared AccessDecision contract, checked like any wire value. */
function decisionFor(
  request: VerificationRequest,
  holderId: string,
  answer: Answer,
  now: number,
): AccessDecision {
  return parseContract('AccessDecision', {
    schemaVersion: '1.0.0',
    holderId,
    consentRequestId: request.requestId,
    recipientId: request.recipientId,
    recipientKeyId: request.recipientKeyId,
    decidedAt: new Date(now).toISOString(),
    expiresAt: request.expiresAt,
    ...(answer.outcome === 'deny'
      ? { outcome: 'deny', reason: answer.reason ?? 'holder-refused' }
      : answer),
  })
}

/** B's share service reads this shape; only an allow naming one item version maps to it. */
export function toConsentDecision(decision: AccessDecision): ConsentDecision | null {
  if (
    decision.outcome !== 'allow' ||
    decision.itemId === undefined ||
    decision.itemVersion === undefined
  ) {
    return null
  }
  return {
    outcome: 'allow',
    holderId: decision.holderId,
    recipientId: decision.recipientId,
    recipientKeyId: decision.recipientKeyId,
    itemId: decision.itemId,
    itemVersion: decision.itemVersion,
    consentRequestId: decision.consentRequestId,
    expiresAt: decision.expiresAt,
  }
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
  decide(requestId: string, holderId: string, answer: Answer, now = Date.now()): StoredRequest {
    const stored = this.get(requestId, now)
    if (!stored) throw new RequestError(404, 'This request does not exist.')
    if (stored.state === 'expired') throw new RequestError(410, 'This request has expired.')
    if (stored.state !== 'pending') {
      throw new RequestError(409, 'This request was already answered.')
    }
    stored.decision = decisionFor(stored.request, holderId, answer, now)
    stored.state = answer.outcome === 'deny' ? 'refused' : 'allowed'
    return stored
  }

  /** Undoes a consent whose grant could not be created, so the holder can answer again. */
  reopen(requestId: string): void {
    const stored = this.#requests.get(requestId)
    if (stored?.state !== 'allowed' || stored.shareReference) return
    stored.state = 'pending'
    delete stored.decision
  }

  /** The live consent the share service checks on every step, never taken from a request body. */
  readDecision(requestId: string): ConsentDecision | null {
    const stored = this.#requests.get(requestId)
    if (!stored?.decision || (stored.state !== 'allowed' && stored.state !== 'shared')) return null
    return toConsentDecision(stored.decision)
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

  remove(requestId: string): void {
    this.#requests.delete(requestId)
  }

  /** The holder takes the consent back: the requester can no longer download the item. */
  withdraw(requestId: string, now = Date.now()): void {
    const stored = this.#requests.get(requestId)
    if (stored?.decision && (stored.state === 'allowed' || stored.state === 'shared')) {
      stored.state = 'withdrawn'
      stored.decision = decisionFor(
        stored.request,
        stored.decision.holderId,
        { outcome: 'deny', reason: 'consent-withdrawn' },
        now,
      )
    }
  }
}

/**
 * What a requester sends: one signed VerificationRequest per piece of information, all from the
 * same throwaway key, for the same purpose and lifetime, and the public key the answers are
 * wrapped for. The link the requester shares is the bundle id.
 */
export interface RequestBundle {
  bundleId: string
  requester: Address
  /** Declared by the requester, never checked: the screens say so. */
  requesterName: string
  purpose: string
  createdAt: string
  expiresAt: string
  recipientId: string
  recipientKeyId: string
  /** The requester's RSA-OAEP public key, SPKI base64url. */
  publicKey: string
  requestIds: string[]
  /** The first holder to answer; nobody else can answer after them. */
  holderId?: string
}

const OPAQUE_ID = /^[0-9a-f]{32}$/

/** Checks a whole bundle; returns it and its requests, ready to store. */
export async function validateBundle(
  input: unknown,
  context: {
    chainId: number
    attributes: ReadonlySet<string>
    isEncryptionKey: (spkiBase64url: string) => Promise<boolean>
    now?: number
  },
): Promise<{ bundle: RequestBundle; requests: VerificationRequest[] }> {
  const body = (input ?? {}) as {
    bundleId?: unknown
    requesterName?: unknown
    publicKey?: unknown
    requests?: unknown
  }
  const name = typeof body.requesterName === 'string' ? body.requesterName.trim() : ''
  if (!name || name.length > MAX_REQUESTER_NAME_LENGTH) {
    throw new RequestError(
      400,
      `Say who is asking, in ${MAX_REQUESTER_NAME_LENGTH} characters or less.`,
    )
  }
  if (
    typeof body.bundleId !== 'string' ||
    !OPAQUE_ID.test(body.bundleId) ||
    typeof body.publicKey !== 'string' ||
    !Array.isArray(body.requests) ||
    body.requests.length === 0 ||
    body.requests.length > MAX_ATTRIBUTES_PER_REQUEST
  ) {
    throw new RequestError(400, 'The request is malformed.')
  }
  if (!(await context.isEncryptionKey(body.publicKey))) {
    throw new RequestError(400, 'The request is malformed.')
  }
  const first = body.requests[0] as Partial<VerificationRequest>
  const requests: VerificationRequest[] = []
  for (const input of body.requests) {
    requests.push(
      await validateRequest(input, {
        requester: typeof first.requester === 'string' ? first.requester : '',
        chainId: context.chainId,
        recipientId: typeof first.recipientId === 'string' ? first.recipientId : '',
        recipientKeyIds: typeof first.recipientKeyId === 'string' ? [first.recipientKeyId] : [],
        attributes: context.attributes,
        now: context.now,
      }),
    )
  }
  const [head] = requests as [VerificationRequest, ...VerificationRequest[]]
  const consistent = requests.every(
    (r) =>
      r.purpose === head.purpose &&
      r.createdAt === head.createdAt &&
      r.expiresAt === head.expiresAt &&
      r.requestId !== body.bundleId,
  )
  const distinct =
    new Set(requests.map((r) => r.attribute)).size === requests.length &&
    new Set(requests.map((r) => r.requestId)).size === requests.length
  if (!consistent || !distinct) throw new RequestError(400, 'The request is malformed.')

  return {
    bundle: {
      bundleId: body.bundleId,
      requester: head.requester as Address,
      requesterName: name,
      purpose: head.purpose,
      createdAt: head.createdAt,
      expiresAt: head.expiresAt,
      recipientId: head.recipientId,
      recipientKeyId: head.recipientKeyId,
      publicKey: body.publicKey,
      requestIds: requests.map((r) => r.requestId),
    },
    requests,
  }
}

export type Role = 'requester' | 'holder' | 'visitor'

/** Bundles and the requests they hold, in memory: a server restart forgets them. */
export class BundleStore {
  readonly #bundles = new Map<string, RequestBundle>()
  readonly #byRequest = new Map<string, string>()

  add(
    bundle: RequestBundle,
    store: RequestStore,
    requests: VerificationRequest[],
    now = Date.now(),
  ) {
    this.#purge(store, now)
    if (this.#bundles.size >= MAX_OPEN_REQUESTS) {
      throw new RequestError(503, 'Too many open requests right now. Try again later.')
    }
    if (
      this.#bundles.has(bundle.bundleId) ||
      requests.some((r) => this.#byRequest.has(r.requestId) || store.get(r.requestId, now))
    ) {
      throw new RequestError(409, 'This request already exists.')
    }
    for (const request of requests) {
      store.add(request)
      this.#byRequest.set(request.requestId, bundle.bundleId)
    }
    this.#bundles.set(bundle.bundleId, bundle)
  }

  get(bundleId: string): RequestBundle | null {
    return this.#bundles.get(bundleId) ?? null
  }

  ofRequest(requestId: string): RequestBundle | null {
    const id = this.#byRequest.get(requestId)
    return id ? this.get(id) : null
  }

  /** One holder answers a bundle; a second holder with the same link is turned away. */
  claim(bundle: RequestBundle, holderId: string): void {
    if (bundle.holderId && bundle.holderId !== holderId) {
      throw new RequestError(409, 'This request was already answered.')
    }
    bundle.holderId = holderId
  }

  /** Drops bundles a day past their end: nobody can answer or read them any more. */
  #purge(store: RequestStore, now: number) {
    for (const [id, bundle] of this.#bundles) {
      if (Date.parse(bundle.expiresAt) + 24 * 3600 * 1000 > now) continue
      this.#bundles.delete(id)
      for (const requestId of bundle.requestIds) {
        this.#byRequest.delete(requestId)
        store.remove(requestId)
      }
    }
  }
}

/**
 * What a visitor may see of a bundle. Anyone with the link reads who asks, why, for what, and
 * whether it can still be answered: never a value, and never another holder's answers. The
 * requester and the holder who answered see each item's state.
 */
export function bundleView(
  bundle: RequestBundle,
  store: RequestStore,
  role: Role,
  now = Date.now(),
) {
  const expired = Date.parse(bundle.expiresAt) <= now
  const answered = bundle.holderId !== undefined
  return {
    requestId: bundle.bundleId,
    requesterName: bundle.requesterName,
    purpose: bundle.purpose,
    createdAt: bundle.createdAt,
    expiresAt: bundle.expiresAt,
    role,
    status: answered ? 'answered' : expired ? 'expired' : 'open',
    items: bundle.requestIds.map((requestId) => {
      const stored = store.get(requestId, now)
      const state = stored?.state ?? 'expired'
      return {
        requestId,
        attribute: stored?.request.attribute ?? '',
        state:
          role === 'visitor' ? (answered ? 'answered' : expired ? 'expired' : 'pending') : state,
      }
    }),
  }
}
