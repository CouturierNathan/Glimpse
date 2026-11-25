'use client'

import type {
  AttestationRecord,
  DocumentReference,
  EncryptedRecord,
  ExtractedClaim,
  KeyEnvelope,
  ShareGrant,
  SourceClass,
  VerificationRequest,
} from '@glimpse/shared'
import {
  decryptAttestation,
  decryptItem,
  type EncryptedItem,
  encryptAttestation,
  type EncryptionIdentity,
  encryptItem,
  generateEncryptionKeys,
  generateOpaqueId,
  type ItemExpectation,
  packEncryptedItem,
  verifyEncryptedItem,
  wrapForRequester,
} from '@glimpse/vault'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useSession } from './SessionProvider.tsx'

/** What the browser keeps about a stored item. The server only ever sees its ciphertext. */
export interface VaultItem {
  reference: string
  attribute: string
  sourceClass: SourceClass
  /** Creation-time fingerprint of the stored bytes; downloads are checked against it. */
  digest: string
  expected: ItemExpectation
}

interface VaultContextValue {
  items: readonly VaultItem[]
  /**
   * Calls a vault route with this browser's key registered first. If the server forgot the key
   * (a restart), it registers a new one and retries once. Throws a VaultError otherwise.
   */
  request: (url: string, init?: RequestInit) => Promise<Response>
  /** Encrypts one claim in the browser and stores the ciphertext. */
  store: (claim: ExtractedClaim, source: DocumentReference) => Promise<VaultItem>
  /** Encrypts an issuer's signed attestation (class C) in the browser and stores the ciphertext. */
  storeAttestation: (record: AttestationRecord) => Promise<VaultItem>
  /** Downloads, checks and decrypts one item in the browser. */
  open: (item: VaultItem) => Promise<ExtractedClaim | AttestationRecord>
  remove: (item: VaultItem) => Promise<void>
  /** This browser's encryption identity: a requester names it so the item is wrapped for it. */
  identity: () => Promise<EncryptionIdentity>
  /** Consents to a request with one item: wraps its key for the requester, in this browser. */
  share: (requestId: string, item: VaultItem) => Promise<void>
  refuse: (requestId: string) => Promise<void>
  withdraw: (requestId: string) => Promise<void>
  /** For the requester: downloads and decrypts what the holder shared. Verification is separate. */
  receive: (
    requestId: string,
  ) => Promise<{ request: VerificationRequest; claim: ExtractedClaim | AttestationRecord }>
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

type ItemOptions = Parameters<typeof encryptItem>[3]

/** A class C item holds the issuer's whole signed record; the others hold an extracted claim. */
function decrypt(
  record: EncryptedRecord,
  envelope: KeyEnvelope,
  holder: EncryptionIdentity,
  expected: ItemExpectation,
): Promise<ExtractedClaim | AttestationRecord> {
  return expected.sourceClass === 'C'
    ? decryptAttestation(record, envelope, holder, expected)
    : decryptItem(record, envelope, holder, expected)
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext)
  if (!value) throw new Error('useVault must be used inside <VaultProvider>')
  return value
}

export class VaultError extends Error {
  readonly status: number
  readonly code: string | undefined
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'VaultError'
    this.status = status
    this.code = code
  }
}

async function failure(res: Response): Promise<VaultError> {
  const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
  return new VaultError(
    body?.error ?? 'The vault did not answer, try again.',
    res.status,
    body?.code,
  )
}

async function isLocked(res: Response): Promise<boolean> {
  if (res.status !== 409) return false
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { code?: string } | null
  return body?.code === 'VAULT_LOCKED'
}

function base64url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A fresh encryption key pair bound to the holder; the private key cannot be exported. */
async function createIdentity(): Promise<EncryptionIdentity> {
  const res = await fetch('/api/vault/holder')
  if (!res.ok) throw await failure(res)
  const { holderId } = (await res.json()) as { holderId: string }

  const identity = await generateEncryptionKeys(holderId)
  const publicKey = base64url(await crypto.subtle.exportKey('spki', identity.publicKey))
  const registered = await fetch('/api/vault/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientKeyId: identity.recipientKeyId, publicKey }),
  })
  if (!registered.ok) throw await failure(registered)
  return identity
}

/**
 * Holds the holder's encryption keys and the list of stored items, in memory only. Nothing here
 * reaches localStorage: reloading the page drops the keys, and with them access to these items.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const { address, signOut } = useSession()
  const [items, setItems] = useState<VaultItem[]>([])
  const identity = useRef<Promise<EncryptionIdentity> | null>(null)

  // Another wallet, or a sign-out, must not inherit the previous holder's keys or items.
  useEffect(() => {
    identity.current = null
    setItems([])
  }, [address])

  const keys = useCallback((): Promise<EncryptionIdentity> => {
    identity.current ??= createIdentity().catch((error: unknown) => {
      identity.current = null
      throw error
    })
    return identity.current
  }, [])

  const request = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      await keys()
      let res = await fetch(url, init)
      if (await isLocked(res)) {
        identity.current = null
        await keys()
        res = await fetch(url, init)
      }
      if (res.ok) return res
      const error = await failure(res)
      // The server session is gone: drop the client one too, so the sign-in page asks again
      // instead of sending the user straight back here.
      if (error.code === 'SIGNED_OUT') await signOut()
      throw error
    },
    [keys, signOut],
  )

  const save = useCallback(
    async (
      attribute: string,
      encrypt: (holder: EncryptionIdentity, options: ItemOptions) => Promise<EncryptedItem>,
    ): Promise<VaultItem> => {
      const holder = await keys()
      const { record, envelope, recordDigest } = await encrypt(holder, {
        itemId: generateOpaqueId(),
        itemVersion: 1,
        grantId: generateOpaqueId(),
      })
      const { bytes, digest } = await packEncryptedItem({ record, envelopes: [envelope] })
      const res = await request('/api/vault/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      })
      const { reference } = (await res.json()) as { reference: string }

      const item: VaultItem = {
        reference,
        attribute,
        sourceClass: record.sourceClass,
        digest,
        expected: {
          itemId: record.itemId,
          itemVersion: record.itemVersion,
          keyId: record.keyId,
          sourceClass: record.sourceClass,
          grantId: envelope.grantId,
          recordDigest,
        },
      }
      setItems((current) => [...current, item])
      return item
    },
    [keys, request],
  )

  const store = useCallback(
    (claim: ExtractedClaim, source: DocumentReference): Promise<VaultItem> =>
      save(claim.attribute, (holder, options) => encryptItem(claim, source, holder, options)),
    [save],
  )

  const storeAttestation = useCallback(
    (record: AttestationRecord): Promise<VaultItem> =>
      save(record.attribute, (holder, options) => encryptAttestation(record, holder, options)),
    [save],
  )

  const open = useCallback(
    async (item: VaultItem): Promise<ExtractedClaim | AttestationRecord> => {
      const holder = await keys()
      const res = await request(`/api/vault/items/${item.reference}`)
      // Check the fingerprint kept at creation before parsing anything the server returned.
      const packed = await verifyEncryptedItem(new Uint8Array(await res.arrayBuffer()), item.digest)
      const envelope = packed.envelopes.find((e) => e.recipientKeyId === holder.recipientKeyId)
      if (!envelope) throw new Error('This item was encrypted for another key.')
      return decrypt(packed.record, envelope, holder, item.expected)
    },
    [keys, request],
  )

  const remove = useCallback(
    async (item: VaultItem): Promise<void> => {
      await request(`/api/vault/items/${item.reference}`, { method: 'DELETE' }).catch(
        (error: unknown) => {
          // Already gone on the server: drop it from the list all the same.
          if (!(error instanceof VaultError) || error.status !== 404) throw error
        },
      )
      setItems((current) => current.filter((i) => i.reference !== item.reference))
    },
    [request],
  )

  const share = useCallback(
    async (requestId: string, item: VaultItem): Promise<void> => {
      const holder = await keys()
      const decided = await request(
        `/api/requests/${requestId}/decision`,
        json({ outcome: 'allow', reference: item.reference }),
      )
      const { grant, recipient } = (await decided.json()) as {
        grant: ShareGrant
        recipient: { recipientId: string; recipientKeyId: string; publicKey: string }
      }
      const publicKey = await crypto.subtle.importKey(
        'spki',
        fromBase64url(recipient.publicKey),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['wrapKey'],
      )
      const res = await request(`/api/vault/items/${item.reference}`)
      const packed = await verifyEncryptedItem(new Uint8Array(await res.arrayBuffer()), item.digest)
      const own = packed.envelopes.find((e) => e.recipientKeyId === holder.recipientKeyId)
      if (!own) throw new Error('This item was encrypted for another key.')
      const envelope = await wrapForRequester(packed.record, own, holder, item.expected, grant, {
        recipientId: recipient.recipientId,
        recipientKeyId: recipient.recipientKeyId,
        publicKey,
      })
      // The requester checks what it decrypts against these creation-time pins.
      await request(
        `/api/requests/${requestId}/envelope`,
        json({ envelope, expected: { ...item.expected, grantId: grant.grantId } }),
      )
    },
    [keys, request],
  )

  const refuse = useCallback(
    async (requestId: string): Promise<void> => {
      await request(`/api/requests/${requestId}/decision`, json({ outcome: 'deny' }))
    },
    [request],
  )

  const withdraw = useCallback(
    async (requestId: string): Promise<void> => {
      await request(`/api/requests/${requestId}/share`, { method: 'DELETE' })
    },
    [request],
  )

  const receive = useCallback(
    async (requestId: string) => {
      const me = await keys()
      const res = await request(`/api/requests/${requestId}/share`)
      const shared = (await res.json()) as {
        record: EncryptedRecord
        envelope: KeyEnvelope
        expected: ItemExpectation
        request: VerificationRequest
      }
      if (shared.envelope.recipientKeyId !== me.recipientKeyId) {
        throw new Error('This request was made before the page was reloaded. Create a new one.')
      }
      const claim = await decrypt(shared.record, shared.envelope, me, shared.expected)
      return { request: shared.request, claim }
    },
    [keys, request],
  )

  return (
    <VaultContext
      value={{
        items,
        request,
        store,
        storeAttestation,
        open,
        remove,
        identity: keys,
        share,
        refuse,
        withdraw,
        receive,
      }}
    >
      {children}
    </VaultContext>
  )
}
