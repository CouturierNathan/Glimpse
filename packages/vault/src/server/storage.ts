import { randomBytes } from 'node:crypto'
import { parseContract } from '@glimpse/shared'
import type { EncryptedRecord, KeyEnvelope, OpaqueId } from '@glimpse/shared'

/** Random 256-bit lowercase hex; C may prefix 0x to anchor it as bytes32. */
export type StorageReference = string
export interface StoredItem {
  record: EncryptedRecord
  envelopes: KeyEnvelope[]
}
/** Returned ONLY by A's trusted server-side session/identity/key-registry resolver. */
export interface AuthenticatedHolder {
  holderId: OpaqueId
  expiresAt: number
  encryptionKeyIds: readonly OpaqueId[]
}
export type StorageErrorCode =
  'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'TOO_LARGE' | 'CORRUPT' | 'UNAVAILABLE'
export class StorageError extends Error {
  readonly code: StorageErrorCode
  constructor(code: StorageErrorCode) {
    super(`Vault storage: ${code}`)
    this.name = 'StorageError'
    this.code = code
  }
}
/** Internal server backend, never expose directly to request handlers or clients. */
export interface StorageBackend {
  /** Atomic create-if-absent; false means collision, never overwrite. */
  create(holderId: OpaqueId, ref: StorageReference, bytes: Uint8Array): Promise<boolean>
  read(holderId: OpaqueId, ref: StorageReference, maxBytes: number): Promise<Uint8Array | null>
  remove(holderId: OpaqueId, ref: StorageReference): Promise<boolean>
}
export interface VaultStorage {
  put(input: unknown): Promise<StorageReference>
  get(ref: StorageReference): Promise<StoredItem | null>
  delete(ref: StorageReference): Promise<boolean>
}
export const DEFAULT_MAX_OBJECT_BYTES = 256 * 1024
export const MAX_ENVELOPES = 8
export function assertHolderId(id: string): void {
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) throw new StorageError('INVALID_INPUT')
}
export function assertReference(ref: string): void {
  if (typeof ref !== 'string' || !/^[0-9a-f]{64}$/.test(ref)) {
    throw new StorageError('INVALID_INPUT')
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageError('INVALID_INPUT')
  }
  return value as Record<string, unknown>
}
function validate(input: unknown, holder: AuthenticatedHolder): StoredItem {
  const value = object(input)
  if (
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'record') ||
    !Object.hasOwn(value, 'envelopes')
  ) {
    throw new StorageError('INVALID_INPUT')
  }
  if (
    !Array.isArray(value.envelopes) ||
    value.envelopes.length < 1 ||
    value.envelopes.length > MAX_ENVELOPES
  ) {
    throw new StorageError('INVALID_INPUT')
  }
  const record = parseContract('EncryptedRecord', value.record)
  const envelopes = value.envelopes.map((entry: unknown) => parseContract('KeyEnvelope', entry))
  if (new Set(envelopes.map((e) => e.envelopeId)).size !== envelopes.length) {
    throw new StorageError('INVALID_INPUT')
  }
  for (const e of envelopes) {
    if (
      e.itemId !== record.itemId ||
      e.itemVersion !== record.itemVersion ||
      e.keyId !== record.keyId
    ) {
      throw new StorageError('INVALID_INPUT')
    }
    // Third-party grants require #10's AccessDecision integration, not a client-supplied flag.
    if (e.recipientId !== holder.holderId || !holder.encryptionKeyIds.includes(e.recipientKeyId)) {
      throw new StorageError('FORBIDDEN')
    }
  }
  return { record, envelopes }
}
function serialize(value: unknown, max: number): Uint8Array {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch {
    throw new StorageError('INVALID_INPUT')
  }
  if (text === undefined) throw new StorageError('INVALID_INPUT')
  if (Buffer.byteLength(text, 'utf8') > max) throw new StorageError('TOO_LARGE')
  return new TextEncoder().encode(text)
}
/** Server composition root. authenticate must close over verified session state, never request JSON. */
export function createVaultStorage(options: {
  backend: StorageBackend
  authenticate: () => Promise<AuthenticatedHolder | null>
  maxObjectBytes?: number
}): VaultStorage {
  const max = options.maxObjectBytes ?? DEFAULT_MAX_OBJECT_BYTES
  if (!Number.isSafeInteger(max) || max < 1 || max > 16 * 1024 * 1024) {
    throw new StorageError('INVALID_INPUT')
  }
  async function authenticate(): Promise<AuthenticatedHolder> {
    let value: AuthenticatedHolder | null
    try {
      value = await options.authenticate()
    } catch {
      throw new StorageError('UNAVAILABLE')
    }
    if (!value || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= Date.now()) {
      throw new StorageError('UNAUTHENTICATED')
    }
    try {
      assertHolderId(value.holderId)
      if (!Array.isArray(value.encryptionKeyIds) || value.encryptionKeyIds.length === 0) {
        throw new StorageError('UNAUTHENTICATED')
      }
      value.encryptionKeyIds.forEach(assertHolderId)
    } catch {
      throw new StorageError('UNAUTHENTICATED')
    }
    return {
      holderId: value.holderId,
      expiresAt: value.expiresAt,
      encryptionKeyIds: [...value.encryptionKeyIds],
    }
  }
  async function io<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof StorageError) throw error
      throw new StorageError('UNAVAILABLE')
    }
  }
  return {
    async put(input) {
      const holder = await authenticate()
      serialize(input, max) // Bound untrusted JSON before the shared schema evaluator.
      let item: StoredItem
      try {
        item = validate(input, holder)
      } catch (error) {
        if (error instanceof StorageError) throw error
        throw new StorageError('INVALID_INPUT')
      }
      const bytes = serialize({ storageVersion: 1, ...item }, max)
      for (let attempt = 0; attempt < 3; attempt++) {
        const ref = randomBytes(32).toString('hex')
        if (await io(() => options.backend.create(holder.holderId, ref, bytes))) return ref
      }
      throw new StorageError('UNAVAILABLE')
    },
    async get(ref) {
      const holder = await authenticate()
      assertReference(ref)
      const bytes = await io(() => options.backend.read(holder.holderId, ref, max))
      if (bytes === null) return null
      if (bytes.byteLength > max) throw new StorageError('CORRUPT')
      try {
        const stored = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
        if (stored.storageVersion !== 1 || Object.keys(stored).length !== 3) {
          throw new StorageError('CORRUPT')
        }
        return validate({ record: stored.record, envelopes: stored.envelopes }, holder)
      } catch {
        throw new StorageError('CORRUPT')
      }
    },
    async delete(ref) {
      const holder = await authenticate()
      assertReference(ref)
      return io(() => options.backend.remove(holder.holderId, ref))
    },
  }
}
