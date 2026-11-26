'use client'

import { useRouter } from 'next/navigation'
import type { FormEvent } from 'react'

import { FieldError, useFieldErrors } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'

/** Takes a request link, or just its id, and opens it. */
export function OpenRequest() {
  const router = useRouter()
  const { t } = useI18n()
  const fields = useFieldErrors()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const text = String(new FormData(form).get('link') ?? '').trim()
    const id = /([0-9a-f]{32})\/?\s*$/.exec(text)?.[1]
    if (
      !fields.report(
        { link: !text ? t('form.required') : !id ? t('requests.open.invalid') : undefined },
        form,
      )
    ) {
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
          {...fields.control('link')}
        />
        <button type="submit" className="button">
          {t('requests.open.button')}
        </button>
      </div>
      <FieldError name="link" message={fields.errors.link} />
    </form>
  )
}
