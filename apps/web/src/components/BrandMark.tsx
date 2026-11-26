/** An aperture: a closed eye with one slit open. Also the favicon (app/icon.svg). */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="6" y="13.5" width="20" height="5" rx="2.5" fill="var(--tint)" />
    </svg>
  )
}
