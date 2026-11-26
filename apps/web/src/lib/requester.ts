'use client'

import type {
  AttestationRecord,
  EncryptedRecord,
  ExtractedClaim,
  KeyEnvelope,
  VerificationRequest,
  VerificationResult,
} from '@glimpse/shared'
import {
  decryptAttestation,
  decryptItem,
  generateEncryptionKeys,
  generateOpaqueId,
  type ItemExpectation,
} from '@glimpse/vault'
import { requestDomain, requestMessage, requestTypes } from '@glimpse/verifier'
import type { Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { appChain } from './chains.ts'
import { REQUESTER_PROOF_HEADER, requesterProofMessage } from './request-proof.ts'
import { type OwnRequest, saveOwnRequest } from './requester-store.ts'
import { verifyShared } from './verify-client.ts'

/** A failure from the server, with its message (translated on screen). */
export class RequesterError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'RequesterError'
    this.status = status
  }
}

async function failure(res: Response): Promise<RequesterError> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return new RequesterError(body?.error ?? 'Something went wrong on the server.', res.status)
}

function base64url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Creates a request without a wallet: a throwaway key signs one VerificationRequest per piece of
 * information (the verifier checks that signature), and a fresh encryption key receives the
 * answers. Both stay in this browser.
 */
export async function createRequest(input: {
  requesterName: string
  purpose: string
  attributes: string[]
  lifetimeHours: number
}): Promise<string> {
  const signerKey = generatePrivateKey()
  const signer = privateKeyToAccount(signerKey)
  const identity = await generateEncryptionKeys(generateOpaqueId())
  const publicKey = base64url(await crypto.subtle.exportKey('spki', identity.publicKey))
  // Whole seconds: the signed message carries Unix times.
  const now = Math.floor(Date.now() / 1000) * 1000
  const createdAt = new Date(now).toISOString()
  const expiresAt = new Date(now + input.lifetimeHours * 3600 * 1000).toISOString()
  const requestId = generateOpaqueId()

  const requests: VerificationRequest[] = []
  for (const attribute of input.attributes) {
    const body = {
      schemaVersion: '1.0.0' as const,
      requestId: generateOpaqueId(),
      requester: signer.address,
      attribute,
      purpose: input.purpose,
      recipientId: identity.recipientId,
      recipientKeyId: identity.recipientKeyId,
      createdAt,
      expiresAt,
    }
    const signature = await signer.signTypedData({
      domain: requestDomain(appChain.id),
      types: requestTypes,
      primaryType: 'VerificationRequest',
      message: requestMessage(body),
    })
    requests.push({ ...body, proof: { type: 'EIP712', chainId: appChain.id, signature } })
  }

  const res = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bundleId: requestId,
      requesterName: input.requesterName,
      publicKey,
      requests,
    }),
  })
  if (!res.ok) throw await failure(res)
  await saveOwnRequest({
    requestId,
    requesterName: input.requesterName,
    purpose: input.purpose,
    createdAt,
    expiresAt,
    signerKey,
    identity,
    requests,
  })
  return requestId
}

/** Proves this browser holds the request's key, for a few minutes. */
async function proof(own: OwnRequest): Promise<HeadersInit> {
  const at = new Date().toISOString()
  const signature = await privateKeyToAccount(own.signerKey).signMessage({
    message: requesterProofMessage(own.requestId, at),
  })
  return { [REQUESTER_PROOF_HEADER]: `${at}.${signature}` }
}

export type ItemState =
  'pending' | 'refused' | 'allowed' | 'shared' | 'withdrawn' | 'expired' | 'answered'

export interface RequestView {
  requestId: string
  requesterName: string
  purpose: string
  createdAt: string
  expiresAt: string
  role: 'requester' | 'holder' | 'visitor'
  status: 'open' | 'answered' | 'expired'
  items: { requestId: string; attribute: string; state: ItemState }[]
}

/** A request as anyone with the link sees it, or as its requester when `own` is given. */
export async function fetchRequest(requestId: string, own?: OwnRequest): Promise<RequestView> {
  const res = await fetch(`/api/requests/${requestId}`, {
    headers: own ? await proof(own) : undefined,
    cache: 'no-store',
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as RequestView
}

export interface Received {
  claim: ExtractedClaim | AttestationRecord
  result: VerificationResult
}

/**
 * Downloads one shared piece, decrypts it with this browser's key, and verifies it in this
 * browser against the chain. No Glimpse server says whether it is valid.
 */
export async function receive(own: OwnRequest, requestId: string): Promise<Received> {
  const res = await fetch(`/api/requests/${requestId}/share`, {
    headers: await proof(own),
    cache: 'no-store',
  })
  if (!res.ok) throw await failure(res)
  const shared = (await res.json()) as {
    record: EncryptedRecord
    envelope: KeyEnvelope
    expected: ItemExpectation
    request: VerificationRequest
  }
  const mine = own.requests.find((r) => r.requestId === requestId)
  if (!mine || shared.envelope.recipientKeyId !== own.identity.recipientKeyId) {
    throw new RequesterError('This item was encrypted for another key.', 409)
  }
  const claim =
    shared.expected.sourceClass === 'C'
      ? await decryptAttestation(shared.record, shared.envelope, own.identity, shared.expected)
      : await decryptItem(shared.record, shared.envelope, own.identity, shared.expected)
  // The request checked is this browser's own copy, never the one the server sent back.
  const result = await verifyShared(mine, claim, mine.requester as Address)
  return { claim, result }
}
