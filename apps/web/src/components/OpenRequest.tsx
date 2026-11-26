'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useI18n } from './I18nProvider.tsx'

/** Takes a request link, or just its id, and opens it. */
export function OpenRequest() {
  const router = useRouter()
  const { t } = useI18n()
  const [error, setError] = useState(false)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('link') ?? '')
    const id = /([0-9a-f]{32})\/?\s*$/.exec(text.trim())?.[1]
    if (!id) {
      setError(true)
      return
    }
    router.push(`/consent/${id}`)
  }

  return (
    <form className="open-request" onSubmit={onSubmit} noValidate>
      <label htmlFor="link" className="sr-only">
        {t('requests.open.label')}
      </label>
      <div className="link-row">
        <input
          id="link"
          name="link"
          className="link"
          placeholder="https://…/consent/…"
          aria-invalid={error}
          onChange={() => setError(false)}
        />
        <button type="submit" className="button">
          {t('requests.open.button')}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {t('requests.open.invalid')}
        </p>
      )}
    </form>
  )
}
