import { assertHolderId, assertReference, StorageError } from './storage.ts'
import type { StorageBackend } from './storage.ts'

/**
 * Keeps every object in this process and writes nothing to disk.
 *
 * It is the backend for a platform the file one refuses to run on, and for a host whose
 * filesystem is read-only or thrown away between requests. It holds the same ciphertext under the
 * same rules — the holder's keys still never reach the server — but it is **not durable**: a
 * restart loses every item, and two processes do not share one. The server state the app already
 * keeps in memory (registered keys, requests, decisions, consents) has exactly that lifetime, so
 * nothing here outlives anything else; it is a demo and development store, never a production one.
 */
export function createMemoryStorageBackend(): StorageBackend {
  const objects = new Map<string, Uint8Array>()
  function key(holderId: string, ref: string): string {
    assertHolderId(holderId)
    assertReference(ref)
    return `${holderId}:${ref}`
  }
  return {
    create(holderId, ref, bytes) {
      const id = key(holderId, ref)
      if (objects.has(id)) return Promise.resolve(false)
      objects.set(id, bytes.slice())
      return Promise.resolve(true)
    },
    read(holderId, ref, maxBytes) {
      const bytes = objects.get(key(holderId, ref))
      if (bytes && bytes.length > maxBytes) return Promise.reject(new StorageError('CORRUPT'))
      return Promise.resolve(bytes?.slice() ?? null)
    },
    remove(holderId, ref) {
      return Promise.resolve(objects.delete(key(holderId, ref)))
    },
  }
}
