import type { ExtractionConsent } from '@glimpse/vault/server'

/** How long a holder's "extract these attributes" consent stays usable. */
export const EXTRACTION_CONSENT_TTL_MS = 10 * 60 * 1000

/**
 * Consents the holder gave on the import screen, read back by the extraction service on every
 * step. The service never takes a consent from request JSON, only from here.
 */
export class ExtractionConsentStore {
  readonly #consents = new Map<string, ExtractionConsent>()

  grant(
    consent: Omit<ExtractionConsent, 'granted' | 'expiresAt' | 'purpose' | 'policyVersion'>,
    now = Date.now(),
  ): void {
    this.#consents.set(`${consent.holderId}:${consent.documentId}`, {
      ...consent,
      attributes: [...consent.attributes],
      purpose: 'extract-attributes',
      policyVersion: '1',
      granted: true,
      expiresAt: now + EXTRACTION_CONSENT_TTL_MS,
    })
  }

  read(holderId: string, documentId: string): ExtractionConsent | null {
    const consent = this.#consents.get(`${holderId}:${documentId}`)
    return consent ? structuredClone(consent) : null
  }

  /** Called once extraction finished: a consent covers one run, not later ones. */
  withdraw(holderId: string, documentId: string): void {
    this.#consents.delete(`${holderId}:${documentId}`)
  }
}
