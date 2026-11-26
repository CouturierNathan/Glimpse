'use client'

import type { EncryptionIdentity, ItemExpectation } from '@glimpse/vault'
import type { SourceClass } from '@glimpse/shared'

/** What the browser keeps about a stored item. The server only ever sees its ciphertext. */
export interface VaultItem {
  reference: string
  attribute: string
  sourceClass: SourceClass
  /** Creation-time fingerprint of the stored bytes; downloads are checked against it. */
  digest: string
  expected: ItemExpectation
  /** An organisation's attestation (class C): its id, to recognise it when it arrives again. */
  attestationId?: string
  /** Its standing on chain, checked in this browser by the verifier, and when. */
  verdict?: 'authentic' | 'declared' | 'expired' | 'revoked' | 'undetermined'
  checkedAt?: string
}

/**
 * The holder's keys and item list, kept in this browser's IndexedDB so a reload or a request link
 * opened in a new tab finds the vault open. The private key is a non-extractable CryptoKey: even
 * this page cannot read its bytes, and it never leaves the browser. Signing out deletes the entry.
 * It is tied to the server's holder id: a server that forgot the holder makes it useless.
 */
export interface LocalVault {
  wallet: string
  holderId: string
  identity: EncryptionIdentity
  items: VaultItem[]
}

const DB = 'glimpse-vault'
const STORE = 'vaults'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'wallet' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed'))
    })
  } finally {
    db.close()
  }
}

const key = (wallet: string) => wallet.toLowerCase()

/** Storage can be unavailable (private window, blocked site data): the vault then lives in the tab. */
export const loadLocalVault = (wallet: string) =>
  run<LocalVault | undefined>(
    'readonly',
    (s) => s.get(key(wallet)) as IDBRequest<LocalVault | undefined>,
  ).catch(() => undefined)

export const saveLocalVault = (vault: LocalVault) =>
  run('readwrite', (s) => s.put({ ...vault, wallet: key(vault.wallet) })).catch(() => undefined)

export const deleteLocalVault = (wallet: string) =>
  run('readwrite', (s) => s.delete(key(wallet))).catch(() => undefined)
