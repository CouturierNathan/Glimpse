import { parseContract } from '@glimpse/shared'
import type { EncryptedRecord, KeyEnvelope } from '@glimpse/shared'
export class IntegrityError extends Error {
  constructor() {
    super('Encrypted content does not match the trusted client fingerprint')
    this.name = 'IntegrityError'
  }
}
export async function fingerprintBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
/** Compute at creation and retain in trusted client state, not from a storage read response. */
export async function fingerprintRecord(input: unknown): Promise<string> {
  const r = parseContract('EncryptedRecord', input)
  return fingerprintBytes(
    new TextEncoder().encode(
      JSON.stringify([
        r.schemaVersion,
        r.itemId,
        r.itemVersion,
        r.keyId,
        r.sourceClass,
        r.algorithm,
        r.iv,
        r.aadVersion,
        r.ciphertext,
      ]),
    ),
  )
}
export async function assertRecordFingerprint(
  record: EncryptedRecord,
  expected: string,
): Promise<void> {
  if (
    typeof expected !== 'string' ||
    !/^[0-9a-f]{64}$/.test(expected) ||
    (await fingerprintRecord(record)) !== expected
  ) {
    throw new IntegrityError()
  }
}
export interface PackedItem {
  record: EncryptedRecord
  envelopes: KeyEnvelope[]
}
function parsePacked(value: unknown): PackedItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IntegrityError()
  const v = value as Record<string, unknown>
  if (
    Object.keys(v).length !== 3 ||
    v.storageVersion !== 1 ||
    !Array.isArray(v.envelopes) ||
    v.envelopes.length < 1 ||
    v.envelopes.length > 8
  ) {
    throw new IntegrityError()
  }
  const record = parseContract('EncryptedRecord', v.record)
  const envelopes = v.envelopes.map((e) => parseContract('KeyEnvelope', e))
  for (const e of envelopes) {
    if (
      e.itemId !== record.itemId ||
      e.itemVersion !== record.itemVersion ||
      e.keyId !== record.keyId
    ) {
      throw new IntegrityError()
    }
  }
  return { record, envelopes }
}
/** Exact encrypted bytes and client pin. Server putBytes must preserve these bytes verbatim. */
export async function packEncryptedItem(
  input: PackedItem,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; digest: string }> {
  const item = parsePacked({ storageVersion: 1, ...input })
  const bytes = new TextEncoder().encode(JSON.stringify({ storageVersion: 1, ...item }))
  if (bytes.byteLength > 256 * 1024) throw new IntegrityError()
  return { bytes, digest: await fingerprintBytes(bytes) }
}
/** Verify a trusted creation-time pin BEFORE interpreting downloaded bytes or decrypting. */
export async function verifyEncryptedItem(
  bytes: Uint8Array,
  expectedDigest: string,
): Promise<PackedItem> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 256 * 1024) throw new IntegrityError()
  const snapshot = Uint8Array.from(bytes)
  if (
    snapshot.byteLength > 256 * 1024 ||
    !/^[0-9a-f]{64}$/.test(expectedDigest) ||
    (await fingerprintBytes(snapshot)) !== expectedDigest
  ) {
    throw new IntegrityError()
  }
  try {
    return parsePacked(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(snapshot)))
  } catch {
    throw new IntegrityError()
  }
}
