'use client'

import type {
  AttestationRecord,
  DocumentReference,
  EncryptedRecord,
  ExtractedClaim,
  KeyEnvelope,
  ShareGrant,
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
  fingerprintBytes,
  fingerprintRecord,
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

import { attestationVerdict, fromBase64 } from '@/lib/attestation-delivery.ts'
import { anchorStatus } from '@/lib/attestation-check.ts'
import { appChain, attestationRegistry } from '@/lib/chains.ts'
import { readAttestationFile } from '@/lib/issuer.ts'
import {
  deleteLocalVault,
  loadLocalVault,
  saveLocalVault,
  type VaultItem,
} from '@/lib/vault/local.ts'

import { useIdentity } from './IdentityProvider.tsx'
import { useSession } from './SessionProvider.tsx'

export type { VaultItem }

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
  /** True once the keys and the items kept in this browser are loaded. */
  ready: boolean
  /** Attestations organisations sent that this vault picked up since it opened. */
  arrived: number
  /** Signs out and deletes the keys and items this browser kept. */
  signOut: () => Promise<void>
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

async function holderId(): Promise<string> {
  const res = await fetch('/api/vault/holder')
  if (!res.ok) throw await failure(res)
  return ((await res.json()) as { holderId: string }).holderId
}

/** Tells the server this browser's public key; the same key again is harmless. */
async function register(identity: EncryptionIdentity): Promise<void> {
  const publicKey = base64url(await crypto.subtle.exportKey('spki', identity.publicKey))
  const registered = await fetch('/api/vault/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientKeyId: identity.recipientKeyId, publicKey }),
  })
  if (!registered.ok) throw await failure(registered)
}

/**
 * Holds the holder's encryption keys and the list of stored items. They are kept in this browser
 * (lib/vault/local.ts), so a reload or a request link opened in another tab finds the vault; the
 * private key cannot be exported and never leaves the browser. Signing out deletes them.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const { address, signOut: endSession } = useSession()
  const { refresh: refreshIdentity, status: identityStatus } = useIdentity()
  const [items, setItems] = useState<VaultItem[]>([])
  const [ready, setReady] = useState(false)
  const identity = useRef<Promise<EncryptionIdentity> | null>(null)
  const holder = useRef<string | null>(null)

  /**
   * This browser's keys for the signed-in wallet: the ones kept from before when the server still
   * knows the same holder, else a fresh pair. Either way the server learns the public key.
   */
  const keys = useCallback((): Promise<EncryptionIdentity> => {
    identity.current ??= (async () => {
      if (!address) {
        throw new VaultError('Your session has ended. Sign in again.', 401, 'SIGNED_OUT')
      }
      const id = await holderId()
      const kept = await loadLocalVault(address)
      const reuse = kept?.holderId === id ? kept.identity : null
      const current = reuse ?? (await generateEncryptionKeys(id))
      await register(current)
      holder.current = id
      if (!reuse) {
        await saveLocalVault({ wallet: address, holderId: id, identity: current, items: [] })
      }
      return current
    })().catch((error: unknown) => {
      identity.current = null
      throw error
    })
    return identity.current
  }, [address])

  // Another wallet, or a sign-out, must not inherit the previous holder's keys or items. The
  // signed-in wallet gets back what this browser kept for it.
  useEffect(() => {
    identity.current = null
    holder.current = null
    setItems([])
    setReady(false)
    if (!address) return
    let cancelled = false
    void (async () => {
      const kept = await loadLocalVault(address)
      if (kept && !cancelled) {
        try {
          await keys()
          if (!cancelled && holder.current === kept.holderId) setItems(kept.items)
        } catch {
          // Signed out or server unreachable: the screens say so on the next vault call.
        }
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [address, keys])

  // The item list follows every change, so another tab or a reload sees the same vault.
  useEffect(() => {
    if (!address || !ready || !holder.current) return
    const holderId = holder.current
    void identity.current?.then((current) =>
      saveLocalVault({ wallet: address, holderId, identity: current, items }),
    )
  }, [address, ready, items])

  /** Signs out and deletes what this browser kept of the vault. */
  const signOut = useCallback(async () => {
    if (address) await deleteLocalVault(address)
    await endSession()
  }, [address, endSession])

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
      if (error.code === 'SIGNED_OUT') await endSession()
      // The server forgot the identity (a restart): lock the screens that need it again.
      if (error.code === 'IDENTITY_REQUIRED') await refreshIdentity()
      throw error
    },
    [keys, endSession, refreshIdentity],
  )

  const save = useCallback(
    async (
      attribute: string,
      encrypt: (holder: EncryptionIdentity, options: ItemOptions) => Promise<EncryptedItem>,
      extra: Partial<VaultItem> = {},
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
        ...extra,
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

  /** Records where an attestation stands on chain, checked here by the verifier. */
  const check = useCallback(async (reference: string, record: AttestationRecord) => {
    const verdict = await attestationVerdict(record).catch(() => 'undetermined' as const)
    setItems((current) =>
      current.map((i) =>
        i.reference === reference ? { ...i, verdict, checkedAt: new Date().toISOString() } : i,
      ),
    )
  }, [])

  const storeAttestation = useCallback(
    async (record: AttestationRecord): Promise<VaultItem> => {
      const item = await save(
        record.attribute,
        (holder, options) => encryptAttestation(record, holder, options),
        { attestationId: record.attestationId },
      )
      void check(item.reference, record)
      return item
    },
    [save, check],
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

  const [arrived, setArrived] = useState(0)
  const syncing = useRef(false)
  const itemsRef = useRef(items)
  itemsRef.current = items

  /**
   * Picks up the attestations organisations sent: decrypts each with this browser's key, keeps it
   * only if it is addressed to this wallet, on this network, recorded on chain and not revoked,
   * and deletes it from the inbox. An entry sealed for another of the holder's browsers stays.
   */
  const syncInbox = useCallback(async () => {
    if (!address || syncing.current) return
    syncing.current = true
    try {
      const holder = await keys()
      const res = await fetch('/api/inbox', { cache: 'no-store' })
      if (!res.ok) return
      const entries = (await res.json()) as { id: string; item: string }[]
      for (const entry of entries) {
        const drop = () => fetch(`/api/inbox/${entry.id}`, { method: 'DELETE' })
        let record: AttestationRecord
        try {
          const bytes = fromBase64(entry.item)
          const packed = await verifyEncryptedItem(bytes, await fingerprintBytes(bytes))
          const envelope = packed.envelopes.find((e) => e.recipientKeyId === holder.recipientKeyId)
          if (!envelope) continue
          const opened = await decryptAttestation(packed.record, envelope, holder, {
            itemId: packed.record.itemId,
            itemVersion: packed.record.itemVersion,
            keyId: packed.record.keyId,
            sourceClass: 'C',
            grantId: envelope.grantId,
            recordDigest: await fingerprintRecord(packed.record),
          })
          record = readAttestationFile(JSON.stringify(opened), {
            holder: address,
            chainId: appChain.id,
            attestationRegistry,
          })
        } catch {
          await drop() // unreadable or not for this wallet: nothing to keep
          continue
        }
        const onChain = await anchorStatus(record)
        if (onChain === 'unreadable') continue // try again on the next visit
        if (onChain !== 'anchored') {
          await drop()
          continue
        }
        if (!itemsRef.current.some((i) => i.attestationId === record.attestationId)) {
          await storeAttestation(record)
          setArrived((n) => n + 1)
        }
        await drop()
      }
    } catch {
      // Signed out, identity not verified yet, or offline: the entries wait for the next visit.
    } finally {
      syncing.current = false
    }
  }, [address, keys, storeAttestation])

  // Once the vault is open (and the identity verified, which storing needs), collect what arrived
  // and refresh the standing of attestations not checked in the last ten minutes.
  useEffect(() => {
    if (!ready || !address || identityStatus !== 'verified') return
    void syncInbox()
    for (const item of itemsRef.current) {
      if (item.sourceClass !== 'C') continue
      if (item.checkedAt && Date.now() - Date.parse(item.checkedAt) < 10 * 60_000) continue
      void open(item)
        .then((record) => check(item.reference, record as AttestationRecord))
        .catch(() => undefined)
    }
  }, [ready, address, identityStatus, syncInbox, check, open])

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
        ready,
        arrived,
        signOut,
      }}
    >
      {children}
    </VaultContext>
  )
}
