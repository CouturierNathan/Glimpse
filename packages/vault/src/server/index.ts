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
export {
  extractClaims,
  selectedExcerpts,
  syntheticDemoModel,
  ExtractionError,
} from './extraction.ts'
export type { TextPage, AttributeSpec, ExtractionDocument, ExtractionModel } from './extraction.ts'
export { createOllamaModel } from './ollama.ts'
export { withPdfPages } from './pdf.ts'
export { createPrivateExtractionService, EXTRACTION_POLICY_VERSION } from './privacy.ts'
export type { ExtractionConsent } from './privacy.ts'
