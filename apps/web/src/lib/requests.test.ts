import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseContract, type VerificationRequest } from '@glimpse/shared'
import { requestDomain, requestMessage, requestTypes } from '@glimpse/verifier'
import { privateKeyToAccount } from 'viem/accounts'

import { RequestError, RequestStore, toConsentDecision, validateRequest } from './requests.ts'

// Hardhat's first two well-known test accounts: public, never funded on a real chain.
const requester = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)
const stranger = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)
const CHAIN = 11155111
const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const recipientId = 'a'.repeat(32)
const recipientKeyId = 'b'.repeat(32)

async function signedRequest(
  overrides: Partial<Omit<VerificationRequest, 'proof'>> = {},
  signer = requester,
): Promise<VerificationRequest> {
  const body = {
    schemaVersion: '1.0.0' as const,
    requestId: 'c'.repeat(32),
    requester: requester.address,
    attribute: 'exam_score',
    purpose: 'Check the exam score for admission',
    recipientId,
    recipientKeyId,
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 30 * 60_000).toISOString(),
    ...overrides,
  }
  const signature = await signer.signTypedData({
    domain: requestDomain(CHAIN),
    types: requestTypes,
    primaryType: 'VerificationRequest',
    message: requestMessage(body),
  })
  return { ...body, proof: { type: 'EIP712', chainId: CHAIN, signature } }
}

const context = {
  sessionAddress: requester.address,
  chainId: CHAIN,
  recipientId,
  recipientKeyIds: [recipientKeyId],
  attributes: new Set(['exam_score']),
  now: NOW,
}

async function rejects(input: unknown, status: number, ctx = context) {
  await assert.rejects(validateRequest(input, ctx), (error: unknown) => {
    assert.ok(error instanceof RequestError)
    assert.equal(error.status, status)
    return true
  })
}

test('validateRequest accepts a request signed by the signed-in requester', async () => {
  const request = await signedRequest()
  assert.deepEqual(await validateRequest(request, context), request)
})

test('validateRequest refuses a signature from another wallet', async () => {
  await rejects(await signedRequest({}, stranger), 400)
})

test('validateRequest refuses a request edited after signing', async () => {
  const request = await signedRequest()
  await rejects({ ...request, purpose: 'Something else entirely' }, 400)
})

test('validateRequest refuses a requester other than the session', async () => {
  await rejects(await signedRequest(), 403, { ...context, sessionAddress: stranger.address })
})

test('validateRequest refuses unknown attributes, empty purposes and long lifetimes', async () => {
  await rejects(await signedRequest({ attribute: 'home_address' }), 400)
  await rejects(await signedRequest({ purpose: '   ' }), 400)
  await rejects(
    await signedRequest({ expiresAt: new Date(NOW + 2 * 60 * 60_000).toISOString() }),
    400,
  )
  await rejects(await signedRequest({ expiresAt: new Date(NOW - 1000).toISOString() }), 400)
})

test('validateRequest refuses a key the requester did not register', async () => {
  await rejects(await signedRequest({ recipientKeyId: 'd'.repeat(32) }), 400)
})

test('validateRequest refuses malformed input', async () => {
  await rejects({ requestId: 'nope' }, 400)
})

test('a holder answers a request once', async () => {
  const store = new RequestStore()
  const { request } = { request: await signedRequest() }
  store.add(request)
  assert.equal(store.readDecision(request.requestId), null)

  store.decide(
    request.requestId,
    'e'.repeat(32),
    { outcome: 'allow', itemId: 'f'.repeat(32), itemVersion: 1 },
    NOW,
  )
  assert.deepEqual(store.readDecision(request.requestId), {
    outcome: 'allow',
    holderId: 'e'.repeat(32),
    recipientId,
    recipientKeyId,
    itemId: 'f'.repeat(32),
    itemVersion: 1,
    consentRequestId: request.requestId,
    expiresAt: request.expiresAt,
  })
  const decision = store.get(request.requestId, NOW)?.decision
  assert.deepEqual(parseContract('AccessDecision', decision), decision)
  assert.equal(decision?.decidedAt, new Date(NOW).toISOString())
  assert.throws(
    () => store.decide(request.requestId, 'e'.repeat(32), { outcome: 'deny' }, NOW),
    RequestError,
  )
})

test('a refused or withdrawn request yields no decision', async () => {
  const store = new RequestStore()
  const refused = await signedRequest({ requestId: '1'.repeat(32) })
  store.add(refused)
  store.decide(refused.requestId, 'e'.repeat(32), { outcome: 'deny' }, NOW)
  assert.equal(store.readDecision(refused.requestId), null)
  const refusal = store.get(refused.requestId, NOW)?.decision
  assert.equal(refusal?.reason, 'holder-refused')
  assert.equal(refusal && toConsentDecision(refusal), null)

  const withdrawn = await signedRequest({ requestId: '2'.repeat(32) })
  store.add(withdrawn)
  store.decide(
    withdrawn.requestId,
    'e'.repeat(32),
    { outcome: 'allow', itemId: 'f'.repeat(32), itemVersion: 1 },
    NOW,
  )
  store.withdraw(withdrawn.requestId, NOW)
  assert.equal(store.readDecision(withdrawn.requestId), null)
  assert.deepEqual(store.get(withdrawn.requestId, NOW)?.decision, {
    schemaVersion: '1.0.0',
    outcome: 'deny',
    reason: 'consent-withdrawn',
    holderId: 'e'.repeat(32),
    consentRequestId: withdrawn.requestId,
    recipientId,
    recipientKeyId,
    decidedAt: new Date(NOW).toISOString(),
    expiresAt: withdrawn.expiresAt,
  })
})

test('a pending request past its end date expires and cannot be answered', async () => {
  const store = new RequestStore()
  const request = await signedRequest()
  store.add(request)
  const later = Date.parse(request.expiresAt) + 1
  assert.equal(store.get(request.requestId, later)?.state, 'expired')
  assert.throws(
    () => store.decide(request.requestId, 'e'.repeat(32), { outcome: 'deny' }, later),
    RequestError,
  )
})

test('a consent whose grant failed can be answered again', async () => {
  const store = new RequestStore()
  const request = await signedRequest()
  store.add(request)
  store.decide(
    request.requestId,
    'e'.repeat(32),
    { outcome: 'allow', itemId: 'f'.repeat(32), itemVersion: 1 },
    NOW,
  )
  store.reopen(request.requestId)
  assert.equal(store.get(request.requestId, NOW)?.state, 'pending')
  assert.equal(store.readDecision(request.requestId), null)
})
