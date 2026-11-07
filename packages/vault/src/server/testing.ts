import { assertHolderId, assertReference, StorageError } from './storage.ts'
import type { StorageBackend } from './storage.ts'
/** Test-only adapter; never use as the local demo's durable backend. */
export function createMemoryStorageBackendForTests(): StorageBackend {
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
