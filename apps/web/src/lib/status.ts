import type { SourceClass, VerificationResult } from '@glimpse/shared'

/** The five statuses a verifier can reach (doc §8), shown with the same words everywhere. */
export type Status = VerificationResult['verdict']

export const statuses: readonly Status[] = [
  'authentic',
  'declared',
  'expired',
  'revoked',
  'undetermined',
]

/** The message keys of a status's label and meaning (see lib/i18n/messages.ts). */
export const statusKeys = {
  authentic: { label: 'status.authentic', meaning: 'status.authentic.meaning' },
  declared: { label: 'status.declared', meaning: 'status.declared.meaning' },
  expired: { label: 'status.expired', meaning: 'status.expired.meaning' },
  revoked: { label: 'status.revoked', meaning: 'status.revoked.meaning' },
  undetermined: { label: 'status.undetermined', meaning: 'status.undetermined.meaning' },
} as const satisfies Record<Status, { label: string; meaning: string }>

/**
 * The status of an item the holder keeps, before any requester checks it. Imported and
 * signature-verified documents stay declarations, as the verifier treats them. An organisation's
 * attestation is only authentic, expired or revoked once read from the chain: until then, and
 * whenever the chain cannot be read, it is undetermined, never assumed authentic.
 */
export function holderStatus(sourceClass: SourceClass, chainVerdict?: Status): Status {
  if (sourceClass !== 'C') return 'declared'
  if (chainVerdict === undefined || chainVerdict === 'declared') return 'undetermined'
  return chainVerdict
}
