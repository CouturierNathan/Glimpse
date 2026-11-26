'use client'

import type { AttestationRecord } from '@glimpse/shared'
import {
  encryptAttestation,
  fingerprintBytes,
  generateOpaqueId,
  packEncryptedItem,
} from '@glimpse/vault'
import { requestDomain, requestMessage, requestTypes } from '@glimpse/verifier'
import type { Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { appChain } from './chains.ts'
import type { Status } from './status.ts'
import { verifyShared } from './verify-client.ts'

const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

/**
 * Hands an attestation the organisation just recorded to the holder's vault: encrypted in this
 * browser for each public key the holder registered, then left in the holder's inbox. Returns
 * false when the holder has never opened Glimpse: the file is then the only way to hand it over.
 */
export async function deliverAttestation(record: AttestationRecord): Promise<boolean> {
  const res = await fetch(`/api/holders/${record.holder}/keys`, { cache: 'no-store' })
  if (!res.ok) return false
  const { holderId, keys } = (await res.json()) as {
    holderId: string
    keys: { recipientKeyId: string; publicKey: string }[]
  }
  if (keys.length === 0) return false
  const items: string[] = []
  for (const key of keys) {
    const publicKey = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(atob(key.publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0),
      ),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['wrapKey'],
    )
    const sealed = await encryptAttestation(
      record,
      { recipientId: holderId, recipientKeyId: key.recipientKeyId, publicKey },
      { itemId: generateOpaqueId(), itemVersion: 1, grantId: generateOpaqueId() },
    )
    const { bytes } = await packEncryptedItem({
      record: sealed.record,
      envelopes: [sealed.envelope],
    })
    items.push(toBase64(bytes))
  }
  const sent = await fetch('/api/inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holder: record.holder, items }),
  })
  return sent.ok
}

export { fingerprintBytes }

/**
 * Where an attestation the holder keeps stands, by the same verifier a requester runs: it signs a
 * throwaway request for the attestation's own attribute and checks the record against the chain.
 */
export async function attestationVerdict(record: AttestationRecord): Promise<Status> {
  const signer = privateKeyToAccount(generatePrivateKey())
  const now = Math.floor(Date.now() / 1000) * 1000
  const body = {
    schemaVersion: '1.0.0' as const,
    requestId: generateOpaqueId(),
    requester: signer.address,
    attribute: record.attribute,
    purpose: 'Holder self-check',
    recipientId: generateOpaqueId(),
    recipientKeyId: generateOpaqueId(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60_000).toISOString(),
  }
  const signature = await signer.signTypedData({
    domain: requestDomain(appChain.id),
    types: requestTypes,
    primaryType: 'VerificationRequest',
    message: requestMessage(body),
  })
  const result = await verifyShared(
    { ...body, proof: { type: 'EIP712', chainId: appChain.id, signature } },
    record,
    signer.address as Address,
  )
  return result.verdict
}
