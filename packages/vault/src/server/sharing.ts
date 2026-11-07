import { createHash, randomBytes } from 'node:crypto'
import { parseContract, assertShareBinding } from '@glimpse/shared'
import type { EncryptedRecord, KeyEnvelope, ShareGrant } from '@glimpse/shared'
import { assertLiveGrant } from '../index.ts'
import { assertHolderId, assertReference, createVaultStorage, StorageError } from './storage.ts'
import type { AuthenticatedHolder, StorageBackend } from './storage.ts'

/** B's adapter boundary only; A owns AccessDecision and its trust/signature/consent checks. */
export interface ConsentDecision {
  outcome: 'allow' | 'deny'
  holderId: string
  recipientId: string
  recipientKeyId: string
  itemId: string
  itemVersion: number
  consentRequestId: string
  expiresAt: string
}
interface ShareReceipt {
  grant: ShareGrant
  reference: string
  keyId: string
  recipientKeyId: string
  ownerKeyIds: string[]
}
const namespace = 'e'.repeat(32) // Internal namespace, not a secret, wallet or authenticated holder.
const derivedRef = (kind: string, id: string) =>
  createHash('sha256').update(`glimpse.share.${kind}:${id}`).digest('hex')
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
export function createShareService(options: {
  backend: StorageBackend
  authenticate: () => Promise<AuthenticatedHolder | null>
  /** Read live from A's authenticated consent store on every issue/publish/delivery. Never from body. */
  readDecision: (consentRequestId: string) => Promise<ConsentDecision | null>
}) {
  async function auth() {
    const h = await options.authenticate()
    if (!h || h.expiresAt <= Date.now()) throw new StorageError('UNAUTHENTICATED')
    assertHolderId(h.holderId)
    if (!Array.isArray(h.encryptionKeyIds) || !h.encryptionKeyIds.length) {
      throw new StorageError('UNAUTHENTICATED')
    }
    h.encryptionKeyIds.forEach(assertHolderId)
    return { ...h, encryptionKeyIds: [...h.encryptionKeyIds] }
  }
  async function load<T>(ref: string): Promise<T | null> {
    const raw = await options.backend.read(namespace, ref, 64 * 1024)
    if (!raw) return null
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as T
    } catch {
      throw new StorageError('CORRUPT')
    }
  }
  async function receipt(ref: string): Promise<ShareReceipt> {
    assertReference(ref)
    const r = await load<ShareReceipt>(ref)
    if (!r) throw new StorageError('FORBIDDEN')
    try {
      r.grant = parseContract('ShareGrant', r.grant)
      assertReference(r.reference)
      assertHolderId(r.keyId)
      assertHolderId(r.recipientKeyId)
      if (!Array.isArray(r.ownerKeyIds) || !r.ownerKeyIds.length) throw new Error()
      r.ownerKeyIds.forEach(assertHolderId)
    } catch {
      throw new StorageError('CORRUPT')
    }
    return r
  }
  async function active(ref: string, r: ShareReceipt) {
    assertLiveGrant(r.grant)
    if (await load(derivedRef('revocation', ref))) throw new StorageError('FORBIDDEN')
    const d = await options.readDecision(r.grant.consentRequestId)
    if (
      !d ||
      d.outcome !== 'allow' ||
      d.holderId !== r.grant.holderId ||
      d.recipientId !== r.grant.recipientId ||
      d.recipientKeyId !== r.recipientKeyId ||
      d.itemId !== r.grant.itemId ||
      d.itemVersion !== r.grant.itemVersion ||
      d.consentRequestId !== r.grant.consentRequestId ||
      !Number.isFinite(Date.parse(d.expiresAt)) ||
      Date.parse(d.expiresAt) <= Date.now() ||
      Date.parse(d.expiresAt) < Date.parse(r.grant.expiresAt)
    ) {
      throw new StorageError('FORBIDDEN')
    }
  }
  function ownerStore(r: ShareReceipt) {
    return createVaultStorage({
      backend: options.backend,
      authenticate: () =>
        Promise.resolve({
          holderId: r.grant.holderId,
          encryptionKeyIds: r.ownerKeyIds,
          expiresAt: Date.now() + 1000,
        }),
    })
  }
  return {
    async authorize(
      reference: string,
      consentRequestId: string,
    ): Promise<{ shareReference: string; grant: ShareGrant; recipientKeyId: string }> {
      const h = await auth()
      assertReference(reference)
      assertHolderId(consentRequestId)
      const item = await createVaultStorage({
        backend: options.backend,
        authenticate: () => Promise.resolve(h),
      }).get(reference)
      if (!item) throw new StorageError('FORBIDDEN')
      const d = await options.readDecision(consentRequestId)
      if (
        !d ||
        d.outcome !== 'allow' ||
        d.holderId !== h.holderId ||
        d.itemId !== item.record.itemId ||
        d.itemVersion !== item.record.itemVersion ||
        d.consentRequestId !== consentRequestId
      ) {
        throw new StorageError('FORBIDDEN')
      }
      assertHolderId(d.recipientId)
      assertHolderId(d.recipientKeyId)
      const grant = parseContract('ShareGrant', {
        schemaVersion: '1.0.0',
        grantId: randomBytes(16).toString('hex'),
        itemId: item.record.itemId,
        itemVersion: item.record.itemVersion,
        holderId: h.holderId,
        recipientId: d.recipientId,
        consentRequestId,
        createdAt: new Date().toISOString(),
        expiresAt: d.expiresAt,
        revocation: { status: 'active' },
      })
      assertLiveGrant(grant)
      const shareReference = derivedRef('consent', consentRequestId)
      const r: ShareReceipt = {
        grant,
        reference,
        keyId: item.record.keyId,
        recipientKeyId: d.recipientKeyId,
        ownerKeyIds: [...h.encryptionKeyIds],
      }
      if (!(await options.backend.create(namespace, shareReference, bytes(r)))) {
        throw new StorageError('FORBIDDEN')
      } // replay denied, including after revoke
      return { shareReference, grant, recipientKeyId: d.recipientKeyId }
    },
    async publish(ref: string, input: unknown): Promise<void> {
      const h = await auth()
      const r = await receipt(ref)
      if (h.holderId !== r.grant.holderId) throw new StorageError('FORBIDDEN')
      await active(ref, r)
      const e = parseContract('KeyEnvelope', input)
      const item = await ownerStore(r).get(r.reference)
      if (!item || item.record.keyId !== r.keyId || e.recipientKeyId !== r.recipientKeyId) {
        throw new StorageError('FORBIDDEN')
      }
      assertShareBinding(item.record, e, r.grant)
      if (!(await options.backend.create(namespace, derivedRef('envelope', ref), bytes(e)))) {
        throw new StorageError('FORBIDDEN')
      }
      await active(ref, r)
    },
    async receive(
      ref: string,
    ): Promise<{ record: EncryptedRecord; envelope: KeyEnvelope; grant: ShareGrant }> {
      const h = await auth()
      const r = await receipt(ref)
      if (h.holderId !== r.grant.recipientId || !h.encryptionKeyIds.includes(r.recipientKeyId)) {
        throw new StorageError('FORBIDDEN')
      }
      await active(ref, r)
      const raw = await load(derivedRef('envelope', ref))
      const e = parseContract('KeyEnvelope', raw)
      const item = await ownerStore(r).get(r.reference)
      if (!item || item.record.keyId !== r.keyId || e.recipientKeyId !== r.recipientKeyId) {
        throw new StorageError('FORBIDDEN')
      }
      assertShareBinding(item.record, e, r.grant)
      await active(ref, r)
      return { record: item.record, envelope: e, grant: r.grant }
    },
    async revoke(ref: string): Promise<void> {
      const h = await auth()
      const r = await receipt(ref)
      if (h.holderId !== r.grant.holderId) throw new StorageError('FORBIDDEN')
      await options.backend.create(
        namespace,
        derivedRef('revocation', ref),
        bytes({ revokedAt: new Date().toISOString() }),
      )
    },
  }
}
