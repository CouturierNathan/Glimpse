import { type IdentityValidationReport, parseContract } from '@glimpse/shared'
import { type Hex, sha256, stringToBytes } from 'viem'

import { RequestError } from '../requests.ts'

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

/** Validation reports and their wallet bindings, in memory: a server restart forgets them. */
export class IdentityReportStore {
  readonly #entries = new Map<string, Entry>()

  add(holderId: string, report: IdentityValidationReport, name?: HolderName): void {
    this.#entries.set(report.reportId, name ? { holderId, report, name } : { holderId, report })
  }

  /**
   * The holder's verified identity: the last proof that passed, states a name and is bound to
   * their wallet. Without it, nothing can be imported or added to the vault.
   */
  verified(holderId: string): (Entry & { name: HolderName }) | null {
    let found: (Entry & { name: HolderName }) | null = null
    for (const entry of this.#entries.values()) {
      if (entry.holderId === holderId && entry.binding && entry.name) {
        found = entry as Entry & { name: HolderName }
      }
    }
    return found
  }

  /** Like `verified`, but throws the answer the routes send when there is none. */
  requireVerified(holderId: string): Entry & { name: HolderName } {
    const entry = this.verified(holderId)
    if (!entry) throw new RequestError(403, IDENTITY_REQUIRED, 'IDENTITY_REQUIRED')
    return entry
  }

  /** The holder's own report; another holder's reads as missing. */
  get(holderId: string, reportId: string): Entry | null {
    const entry = this.#entries.get(reportId)
    return entry?.holderId === holderId ? entry : null
  }

  /** Records a binding whose signature the caller has checked. A report is bound once. */
  bind(holderId: string, reportId: string, address: string, signature: Hex): void {
    const entry = this.get(holderId, reportId)
    if (!entry) throw new RequestError(404, 'This report does not exist.')
    if (entry.report.indication !== 'TOTAL_PASSED') {
      throw new RequestError(409, 'Only a document whose signature passed can be bound.')
    }
    if (!entry.name) throw new RequestError(422, NAME_UNREADABLE)
    if (entry.binding) throw new RequestError(409, 'This report is already bound to a wallet.')
    entry.binding = { address, signature }
  }
}
