export {
  createVaultStorage,
  StorageError,
  DEFAULT_MAX_OBJECT_BYTES,
  MAX_ENVELOPES,
} from './storage.ts'
export type {
  StorageReference,
  StoredItem,
  AuthenticatedHolder,
  VaultStorage,
  StorageBackend,
  StorageErrorCode,
} from './storage.ts'
export { createFileStorageBackend, DEFAULT_STORAGE_DIRECTORY } from './files.ts'
export { createShareService } from './sharing.ts'
export type { ConsentDecision } from './sharing.ts'
