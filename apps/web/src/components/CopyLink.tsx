'use client'

import { useEffect, useState } from 'react'

import { useI18n } from './I18nProvider.tsx'

/** A read-only link with a copy button, and the system share sheet where there is one. */
export function CopyLink({ link, label }: { link: string; label: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  // Read after mount: the server render has no navigator, and both renders must match.
  const [canShare, setCanShare] = useState(false)
  useEffect(() => setCanShare(typeof navigator.share === 'function'), [])

  return (
    <div className="link-row">
      <input
        className="link"
        readOnly
        value={link}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="button quiet"
        onClick={async () => {
          await navigator.clipboard.writeText(link).catch(() => undefined)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        }}
      >
        {copied ? t('verify.copied') : t('verify.copy')}
      </button>
      {canShare && (
        <button
          type="button"
          className="button quiet"
          onClick={() => void navigator.share({ url: link }).catch(() => undefined)}
        >
          {t('verify.shareSheet')}
        </button>
      )}
    </div>
  )
}
