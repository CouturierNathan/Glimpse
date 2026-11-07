import type { ClaimValue, ExtractedClaim } from '@glimpse/shared'

/** What the holder typed, read as the claim's type; `null` if it is not a value of that type. */
export function parseClaimValue(type: ClaimValue['type'], raw: string): ClaimValue | null {
  const text = raw.trim()
  switch (type) {
    case 'boolean':
      return text === 'true' || text === 'false' ? { type, value: text === 'true' } : null
    case 'number': {
      const value = Number(text)
      return text !== '' && Number.isFinite(value) ? { type, value } : null
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text))
        ? { type, value: text }
        : null
    case 'string':
      return text ? { type, value: text } : null
  }
}

/** The value as an input shows it before the holder edits it. */
export function rawClaimValue(value: ClaimValue): string {
  return String(value.value)
}

/**
 * The claim the holder confirmed. A value they changed is theirs, not the document's: it no
 * longer carries the document's verified signature, so a class B claim becomes class A.
 */
export function reviewClaim(claim: ExtractedClaim, raw: string): ExtractedClaim {
  const value = parseClaimValue(claim.value.type, raw)
  if (!value) throw new TypeError(`Enter a valid ${claim.value.type}.`)
  if (value.value === claim.value.value) return claim
  return { ...claim, value, document: { ...claim.document, provenance: { class: 'A' } } }
}
