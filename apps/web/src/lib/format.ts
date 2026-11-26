/** `0x7099…79C8`: enough to recognise an address, short enough for a header. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

type ClaimValue =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }

/** A claim value as the holder reads it: `Yes` (or `Oui`) rather than `true`. */
export function formatClaimValue(value: ClaimValue, locale: 'en' | 'fr' = 'en'): string {
  switch (value.type) {
    case 'boolean':
      if (locale === 'fr') return value.value ? 'Oui' : 'Non'
      return value.value ? 'Yes' : 'No'
    case 'number':
      return value.value.toLocaleString(locale)
    case 'date':
    case 'string':
      return value.value
  }
}
