import type { ExtractionConsent } from '@glimpse/vault/server'

import { getJson, type Kv, setJson } from '../state/kv.ts'

/** How long a holder's "extract these attributes" consent stays usable. */
export const EXTRACTION_CONSENT_TTL_MS = 10 * 60 * 1000

/**
 * Consents the holder gave on the import screen, read back by the extraction service on every
 * step. The service never takes a consent from request JSON, only from here. Kept in the state
 * store, so the consent and the extraction may reach different instances.
 */
export class ExtractionConsentStore {
  readonly #kv: Kv

  constructor(kv: Kv) {
    this.#kv = kv
  }

  async grant(
    consent: Omit<ExtractionConsent, 'granted' | 'expiresAt' | 'purpose' | 'policyVersion'>,
    now = Date.now(),
  ): Promise<void> {
    const stored: ExtractionConsent = {
      ...consent,
      attributes: [...consent.attributes],
      purpose: 'extract-attributes',
      policyVersion: '1',
      granted: true,
      expiresAt: now + EXTRACTION_CONSENT_TTL_MS,
    }
    await setJson(this.#kv, `consent:${consent.holderId}:${consent.documentId}`, stored, {
      ttlMs: EXTRACTION_CONSENT_TTL_MS,
    })
  }

  read(holderId: string, documentId: string): Promise<ExtractionConsent | null> {
    return getJson<ExtractionConsent>(this.#kv, `consent:${holderId}:${documentId}`)
  }

  /** Called once extraction finished: a consent covers one run, not later ones. */
  async withdraw(holderId: string, documentId: string): Promise<void> {
    await this.#kv.del(`consent:${holderId}:${documentId}`)
  }
}
