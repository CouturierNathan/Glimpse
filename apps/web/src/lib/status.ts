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

export const statusCopy: Record<Status, { label: string; meaning: string }> = {
  authentic: {
    label: 'Authentic',
    meaning:
      'An organisation signed it, and the chain confirms the signature, the content and that it is still valid.',
  },
  declared: {
    label: 'Declared',
    meaning: 'Read from a document you added. Nobody vouches for it on chain.',
  },
  expired: {
    label: 'Expired',
    meaning: 'Signed by an organisation, but past the end date it set.',
  },
  revoked: {
    label: 'Revoked',
    meaning: 'The organisation withdrew it. It no longer proves anything.',
  },
  undetermined: {
    label: 'Undetermined',
    meaning: 'Not checked against the chain yet, or the chain could not be read.',
  },
}

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
