import type { StorageBackend, StorageErrorCode } from '@glimpse/vault/server'

import type { Kv } from './kv.ts'

type StorageErrorClass = new (code: StorageErrorCode) => Error

const ID = /^[0-9a-f]{32}$/
const REF = /^[0-9a-f]{64}$/

/**
 * The vault's ciphertext in the shared state store, for a hosted deployment whose instances have
 * no common disk. It stores exactly what the file and memory backends store — bytes the browser
 * encrypted — under the same create-if-absent rule.
 */
export function kvStorageBackend(kv: Kv, StorageError: StorageErrorClass): StorageBackend {
  const key = (holderId: string, ref: string) => {
    if (!ID.test(holderId) || !REF.test(ref)) throw new StorageError('INVALID_INPUT')
    return `vault:${holderId}:${ref}`
  }
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      if (error instanceof Error && error.name === 'StorageError') throw error
      throw new StorageError('UNAVAILABLE')
    }
  }
  return {
    create: (holderId, ref, bytes) =>
      guard(() =>
        kv.set(key(holderId, ref), Buffer.from(bytes).toString('base64'), { onlyIfAbsent: true }),
      ),
    read: (holderId, ref, maxBytes) =>
      guard(async () => {
        const raw = await kv.get(key(holderId, ref))
        if (raw === null) return null
        const bytes = new Uint8Array(Buffer.from(raw, 'base64'))
        if (bytes.length > maxBytes) throw new StorageError('CORRUPT')
        return bytes
      }),
    remove: (holderId, ref) => guard(() => kv.del(key(holderId, ref))),
  }
}
