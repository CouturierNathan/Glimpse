import { type IdentityValidationReport, parseContract } from '@glimpse/shared'
import { type Hex, sha256, stringToBytes } from 'viem'

import { RequestError } from '../requests.ts'
import { getJson, type Kv, setJson } from '../state/kv.ts'

import type { HolderName } from './holder-name.ts'

import { BINDING_WARNING } from './warning.ts'

/** SHA-256 of the report exactly as Glimpse stored it. */
export function reportDigest(report: IdentityValidationReport): Hex {
  return sha256(stringToBytes(JSON.stringify(parseContract('IdentityValidationReport', report))))
}

/**
 * The EIP-191 message the holder signs to bind their wallet to one passed report. Rebuilt by the
 * server from its own copy of the report, never taken from the browser.
 */
export function bindingMessage(
  report: IdentityValidationReport,
  wallet: { address: string; chainId: number },
): string {
  if (report.indication !== 'TOTAL_PASSED') {
    throw new RequestError(409, 'Only a document whose signature passed can be bound.')
  }
  return [
    'Glimpse identity binding',
    '',
    'I bind this wallet to the France Identité document Glimpse checked.',
    '',
    `Wallet: ${wallet.address}`,
    `Chain ID: ${wallet.chainId}`,
    `Report: ${report.reportId}`,
    `Report digest: ${reportDigest(report)}`,
    '',
    `Warning: ${BINDING_WARNING}`,
    '',
    'This signature does not send a transaction or cost gas.',
  ].join('\n')
}

interface Entry {
  holderId: string
  report: IdentityValidationReport
  /** Fingerprints of the name the proof states; absent when it could not be read. */
  name?: HolderName
  binding?: { address: string; signature: Hex }
}

export const IDENTITY_REQUIRED = 'Verify your identity with France Identité first.'
export const NAME_UNREADABLE =
  'The name on this proof could not be read. Use the PDF from the France Identité app.'

/** A checked report stays bindable this long; the binding that verifies an identity, this long. */
export const REPORT_TTL_MS = 60 * 60 * 1000
export const IDENTITY_TTL_MS = 90 * 24 * 60 * 60 * 1000

type Verified = Entry & { name: HolderName; binding: NonNullable<Entry['binding']> }

/**
 * Validation reports and the identity they verify, in the state store: a report checked on one
 * instance can be bound on another, and a verified identity outlives a restart. It keeps the
 * report and keyed fingerprints of the name, never the PDF and never the name itself.
 */
export class IdentityReportStore {
  readonly #kv: Kv

  constructor(kv: Kv) {
    this.#kv = kv
  }

  async add(holderId: string, report: IdentityValidationReport, name?: HolderName): Promise<void> {
    const entry: Entry = name ? { holderId, report, name } : { holderId, report }
    await setJson(this.#kv, `report:${report.reportId}`, entry, { ttlMs: REPORT_TTL_MS })
  }

  /**
   * The holder's verified identity: the last proof that passed, states a name and is bound to
   * their wallet. Without it, nothing can be imported or added to the vault.
   */
  verified(holderId: string): Promise<Verified | null> {
    return getJson<Verified>(this.#kv, `identity:${holderId}`)
  }

  /** Like `verified`, but throws the answer the routes send when there is none. */
  async requireVerified(holderId: string): Promise<Verified> {
    const entry = await this.verified(holderId)
    if (!entry) throw new RequestError(403, IDENTITY_REQUIRED, 'IDENTITY_REQUIRED')
    return entry
  }

  /** The holder's own report; another holder's reads as missing. */
  async get(holderId: string, reportId: string): Promise<Entry | null> {
    if (!/^[0-9a-f]{32}$/.test(reportId)) return null
    const entry = await getJson<Entry>(this.#kv, `report:${reportId}`)
    return entry?.holderId === holderId ? entry : null
  }

  /** Records a binding whose signature the caller has checked. A report is bound once. */
  async bind(holderId: string, reportId: string, address: string, signature: Hex): Promise<void> {
    const entry = await this.get(holderId, reportId)
    if (!entry) throw new RequestError(404, 'This report does not exist.')
    if (entry.report.indication !== 'TOTAL_PASSED') {
      throw new RequestError(409, 'Only a document whose signature passed can be bound.')
    }
    if (!entry.name) throw new RequestError(422, NAME_UNREADABLE)
    if (entry.binding) throw new RequestError(409, 'This report is already bound to a wallet.')
    const bound = { ...entry, binding: { address, signature } }
    await setJson(this.#kv, `report:${reportId}`, bound, { ttlMs: REPORT_TTL_MS })
    await setJson(this.#kv, `identity:${holderId}`, bound, { ttlMs: IDENTITY_TTL_MS })
  }
}
