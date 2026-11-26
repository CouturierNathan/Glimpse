import { join } from 'node:path'

import type * as VaultServerModule from '@glimpse/vault/server'
import type { AuthenticatedHolder, ExtractionModel, StorageBackend } from '@glimpse/vault/server'

import { getSession } from '@/lib/auth/server.ts'
import type { Session } from '@/lib/auth/session.ts'

import { Inbox } from '@/lib/inbox.ts'
import { RequestRepository } from '@/lib/requests.ts'
import type { Kv } from '@/lib/state/kv.ts'
import { derivedKey, redisConfig, stateKv } from '@/lib/state/server.ts'
import { kvStorageBackend } from '@/lib/state/vault-backend.ts'

import { importAttributes } from './attributes.ts'
import { signedOut, vaultLocked } from './http.ts'
import { ExtractionConsentStore } from './consents.ts'
import { HolderRegistry } from './holders.ts'

type VaultServer = typeof VaultServerModule

// Kept on globalThis so every route handler, and dev hot reloads, share the same state.
const shared = globalThis as {
  glimpseVaultServer?: Promise<VaultServer>
  glimpseVaultBackend?: Promise<StorageBackend>
}

/**
 * The server's state store (lib/state/server.ts), opened on first use: which one depends on the
 * configuration and on whether the vault writes to disk, which is only known asynchronously.
 */
export function state(): Promise<Kv> {
  return storageMode().then((mode) => stateKv(() => mode === 'file', storageDirectory))
}

/** The store, as an object the state classes can hold before it is opened. */
export const stateStore: Kv = {
  get: async (key) => (await state()).get(key),
  set: async (key, value, options) => (await state()).set(key, value, options),
  del: async (key) => (await state()).del(key),
}

export const holders = new HolderRegistry(stateStore, () => derivedKey('holder-id'))
export const consents = new ExtractionConsentStore(stateStore)
export const requests = new RequestRepository(stateStore)
export const inbox = new Inbox(stateStore)

/**
 * The vault's server module, imported once per process. The import is bundled, not left to Node
 * at run time: a host that builds the app into a serverless function only ships what the bundler
 * traced, and an import it was told to ignore is missing there.
 */
export function vaultServer(): Promise<VaultServer> {
  return (shared.glimpseVaultServer ??= import('@glimpse/vault/server'))
}

/** A private directory on a persistent disk, set by the server, never by a request. */
function storageDirectory(): string {
  return process.env.VAULT_DATA_DIR ?? join(process.cwd(), '.vault-data')
}

export type StorageMode = 'shared' | 'file' | 'memory'

/**
 * Which store the vault runs on. `VAULT_STORAGE` decides when it is set; otherwise the file one
 * is used wherever it can run. It cannot run on Windows, which has neither `O_NOFOLLOW` nor
 * `O_NONBLOCK`, so there the app keeps the ciphertext in this process rather than refusing every
 * vault request. Memory is not a weaker store — it writes nothing at all — but it is not durable,
 * and the screens say so.
 */
export async function storageMode(): Promise<StorageMode> {
  // A Redis store shared by every instance, when the deployment has one (Vercel KV, Upstash).
  if (redisConfig()) return 'shared'
  if (process.env.VAULT_STORAGE === 'memory') return 'memory'
  if (process.env.VAULT_STORAGE === 'file') return 'file'
  const { fileStorageSupported } = await vaultServer()
  return fileStorageSupported() ? 'file' : 'memory'
}

/**
 * Whether the vault and the server state survive a restart and are the same on every instance:
 * a shared store does, a private disk does on a single long-lived server, a serverless host's
 * disk (Vercel's /tmp) and memory do not.
 */
export async function storageDurable(): Promise<boolean> {
  const mode = await storageMode()
  return mode === 'shared' || (mode === 'file' && !process.env.VERCEL)
}

async function backend(): Promise<StorageBackend> {
  const vault = await vaultServer()
  const mode = await storageMode()
  return (shared.glimpseVaultBackend ??= (
    mode === 'shared'
      ? state().then((kv) => kvStorageBackend(kv, vault.StorageError))
      : mode === 'memory'
        ? Promise.resolve(vault.createMemoryStorageBackend())
        : vault.createFileStorageBackend({ directory: storageDirectory() })
  ).catch((error: unknown) => {
    shared.glimpseVaultBackend = undefined // let the next request retry
    throw error
  }))
}

/** The vault holder behind the verified session cookie; never read from the request body. */
export async function holderOf(session: Session): Promise<AuthenticatedHolder | null> {
  const identity = await holders.find(session.address, session.chainId)
  if (!identity) return null
  return { ...identity, expiresAt: Date.parse(session.expiresAt) }
}

/** The request's holder, or the response that tells the browser what to do about it. */
export async function requireHolder(): Promise<
  | { holder: AuthenticatedHolder; session: Session; failure?: never }
  | { holder?: never; session?: never; failure: Response }
> {
  const session = await getSession()
  if (!session) return { failure: signedOut() }
  const holder = await holderOf(session)
  if (!holder) return { failure: vaultLocked() }
  return { holder, session }
}

/** The signed-in holder, if any; never a failure response. */
export async function optionalHolder(): Promise<AuthenticatedHolder | null> {
  return authenticate()
}

async function authenticate(): Promise<AuthenticatedHolder | null> {
  const session = await getSession()
  return session ? holderOf(session) : null
}

export async function vaultStorage() {
  const { createVaultStorage } = await vaultServer()
  return createVaultStorage({ backend: await backend(), authenticate })
}

/**
 * A local Ollama model when OLLAMA_MODEL is set. Otherwise the offline synthetic extractor, which
 * the service only accepts for synthetic demo documents.
 */
function extractionModel(vault: VaultServer): ExtractionModel {
  const model = process.env.OLLAMA_MODEL
  return model ? vault.createOllamaModel(model) : vault.syntheticDemoModel()
}

export async function extractionService() {
  const vault = await vaultServer()
  return vault.createPrivateExtractionService({
    authenticate,
    readConsent: (holderId, documentId) => consents.read(holderId, documentId),
    attributes: importAttributes.map(({ attribute, label, type }) => ({ attribute, label, type })),
    model: extractionModel(vault),
  })
}

/**
 * Grants, key envelopes and revocation markers for consented shares. Every step reads the
 * holder's live answer from the request store, never from the request body.
 */
export async function shareService(
  /** Who is calling, when it is not the signed-in holder (a requester proving its key). */
  caller?: () => Promise<AuthenticatedHolder | null>,
) {
  const { createShareService } = await vaultServer()
  return createShareService({
    backend: await backend(),
    authenticate: caller ?? authenticate,
    readDecision: async (requestId) =>
      (await requests.openPiece(requestId))?.store.readDecision(requestId) ?? null,
  })
}
