import { schemas } from './schemas.ts'
import type { DataContracts } from './types.ts'

// Restricted evaluator for the published schemas' keyword set. Unknown keywords fail closed.
// Consumers can also use a full JSON Schema draft-2020-12 validator.
type Schema = {
  $schema?: string
  $id?: string
  title?: string
  type?: string
  const?: unknown
  enum?: unknown[]
  oneOf?: Schema[]
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: boolean
  items?: Schema
  minItems?: number
  uniqueItems?: boolean
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
}
const keywords = new Set([
  '$schema',
  '$id',
  'title',
  'type',
  'const',
  'enum',
  'oneOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'minItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'format',
])
function date(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  )
}
function matches(s: Schema, v: unknown): boolean {
  if (Object.keys(s).some((k) => !keywords.has(k))) return false
  if ('const' in s && v !== s.const) return false
  if (s.enum && !s.enum.includes(v)) return false
  if (s.oneOf && s.oneOf.filter((option) => matches(option, v)).length !== 1) return false
  switch (s.type) {
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false
      const o = v as Record<string, unknown>
      const props = s.properties ?? {}
      return (
        (s.required ?? []).every((k) => Object.hasOwn(o, k)) &&
        Object.keys(o).every((k) =>
          Object.hasOwn(props, k)
            ? matches(props[k] as Schema, o[k])
            : s.additionalProperties !== false,
        )
      )
    }
    case 'array':
      return (
        Array.isArray(v) &&
        v.length >= (s.minItems ?? 0) &&
        (!s.uniqueItems || new Set(v.map((x: unknown) => JSON.stringify(x))).size === v.length) &&
        v.every((x: unknown) => s.items !== undefined && matches(s.items, x))
      )
    case 'string':
      return (
        typeof v === 'string' &&
        [...v].length >= (s.minLength ?? 0) &&
        [...v].length <= (s.maxLength ?? Infinity) &&
        (!s.pattern || new RegExp(s.pattern).test(v)) &&
        (!s.format ||
          (s.format === 'date'
            ? date(v)
            : s.format === 'date-time' &&
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
              date(v.slice(0, 10)) &&
              Number.isFinite(Date.parse(v)) &&
              new Date(v).toISOString() === v))
      )
    case 'integer':
    case 'number':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        (s.type !== 'integer' || Number.isSafeInteger(v)) &&
        v >= (s.minimum ?? -Infinity) &&
        v <= (s.maximum ?? Infinity)
      )
    case 'boolean':
      return typeof v === 'boolean'
    case undefined:
      return true
    default:
      return false
  }
}
export type ContractName = keyof DataContracts
/** Structural validation only: never a trust or authorization decision. */
export function isContract<K extends ContractName>(
  name: K,
  value: unknown,
): value is DataContracts[K] {
  return matches(schemas[name] as Schema, value)
}
/** Validate an untrusted JSON boundary, including canonical bytes and chronology. */
export function parseContract<K extends ContractName>(name: K, value: unknown): DataContracts[K] {
  if (!isContract(name, value)) throw new TypeError(`Invalid ${name}`)
  const o = value as unknown as Record<string, unknown>
  for (const key of ['ciphertext', 'iv', 'wrappedKey']) {
    const v = o[key]
    if (typeof v === 'string') {
      const last = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.indexOf(
        v.slice(-1),
      )
      if (!(
        v.length % 4 === 0 ||
        (v.length % 4 === 2 && last % 16 === 0) ||
        (v.length % 4 === 3 && last % 4 === 0)
      )) {
        throw new TypeError('Noncanonical base64url')
      }
    }
  }
  if (name === 'ExtractedClaim') {
    const c = value as DataContracts['ExtractedClaim']
    if (c.period.start > c.period.end) throw new TypeError('Reversed period')
  }
  if (name === 'ShareGrant') {
    const g = value as DataContracts['ShareGrant']
    if (
      g.expiresAt <= g.createdAt ||
      (g.revocation.status === 'revoked' && g.revocation.revokedAt < g.createdAt)
    ) {
      throw new TypeError('Invalid grant chronology')
    }
  }
  if (name === 'AttestationRecord') {
    const a = value as DataContracts['AttestationRecord']
    if (a.expiresAt <= a.issuedAt) throw new TypeError('Invalid attestation chronology')
  }
  if (name === 'VerificationRequest') {
    const r = value as DataContracts['VerificationRequest']
    if (r.expiresAt <= r.createdAt) throw new TypeError('Invalid request chronology')
  }
  if (name === 'VerificationResult') {
    const r = value as DataContracts['VerificationResult']
    const attestation = r.attestationId !== undefined
    if (
      attestation !== (r.issuerId !== undefined) ||
      attestation === (r.verdict === 'declared') ||
      (r.verdict === 'authentic' && Object.values(r.checks).some((c) => c !== 'pass'))
    ) {
      throw new TypeError('Incoherent verification result')
    }
  }
  if (name === 'AuthSession') {
    const a = value as DataContracts['AuthSession']
    if (a.expiresAt <= a.issuedAt) throw new TypeError('Invalid session chronology')
  }
  if (name === 'AccessDecision') {
    const d = value as DataContracts['AccessDecision']
    const item = d.itemId !== undefined
    if (
      item !== (d.itemVersion !== undefined) ||
      item !== (d.outcome === 'allow') ||
      (d.reason !== undefined) !== (d.outcome === 'deny') ||
      (d.outcome === 'allow' && d.expiresAt <= d.decidedAt)
    ) {
      throw new TypeError('Incoherent access decision')
    }
  }
  if (name === 'IdentityValidationReport') {
    const r = value as DataContracts['IdentityValidationReport']
    const passed = r.indication === 'TOTAL_PASSED'
    if (
      passed === (r.subIndication !== undefined) ||
      passed !== Object.values(r.checks).every((c) => c === 'pass') ||
      (passed && (r.signer === undefined || r.trustAnchor === undefined)) ||
      (r.signer !== undefined && r.signer.notAfter <= r.signer.notBefore)
    ) {
      throw new TypeError('Incoherent identity validation report')
    }
  }
  return structuredClone(value) as DataContracts[K]
}
