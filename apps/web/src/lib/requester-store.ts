'use client'

import type { VerificationRequest } from '@glimpse/shared'
import type { EncryptionIdentity } from '@glimpse/vault'
import type { Hex } from 'viem'

/**
 * The requests this browser created, in IndexedDB: the throwaway signing key that proves the
 * requester, and the encryption key the answers are wrapped for (its private half cannot be
 * exported, even from here). Nothing of it leaves the browser. Another browser, or cleared site
 * data, cannot read the answers.
 */
export interface OwnRequest {
  requestId: string
  requesterName: string
  purpose: string
  createdAt: string
  expiresAt: string
  signerKey: Hex
  identity: EncryptionIdentity
  requests: VerificationRequest[]
}

const DB = 'glimpse-requester'
const STORE = 'requests'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'requestId' })
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

export const saveOwnRequest = (entry: OwnRequest) => run('readwrite', (s) => s.put(entry))

export const ownRequest = (requestId: string) =>
  run<OwnRequest | undefined>(
    'readonly',
    (s) => s.get(requestId) as IDBRequest<OwnRequest | undefined>,
  )

export async function ownRequests(): Promise<OwnRequest[]> {
  const all = await run<OwnRequest[]>('readonly', (s) => s.getAll() as IDBRequest<OwnRequest[]>)
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const forgetOwnRequest = (requestId: string) => run('readwrite', (s) => s.delete(requestId))
