'use client'

import { type ChangeEvent, useId, useRef, useState } from 'react'

import { FieldError } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'

interface FilePickerProps {
  /** Form field name, so a surrounding form reads the file from its FormData. */
  name: string
  accept: string
  /** The field title. */
  label: string
  hint?: string
  disabled?: boolean
  buttonLabel?: string
  /** Called with the chosen file. The input is cleared after it returns. */
  onPick?: (file: File) => void
  /** Called with the chosen file, which stays in the form. */
  onSelect?: (file: File | null) => void
  /** Validation message under the field. */
  error?: string
}

/**
 * A file field that looks like the rest of the app.
 *
 * The native control is kept off screen rather than dropped: it is still the thing that opens the
 * picker and still carries the form's value. It is out of the tab order and hidden from assistive
 * technology, because the button next to it does the same job with a name that says what it is
 * for. Nothing here uses `required`: a hidden control that fails validation cannot be focused, and
 * the browser then blocks the submit with no visible reason. The forms check the file themselves.
 */
export function FilePicker({
  name,
  accept,
  label,
  hint,
  disabled,
  buttonLabel,
  onPick,
  onSelect,
  error,
}: FilePickerProps) {
  const { t } = useI18n()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    setChosen(file?.name ?? null)
    onSelect?.(file ?? null)
    if (file && onPick) {
      onPick(file)
      event.currentTarget.value = ''
      setChosen(null)
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        name={name}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onChange}
      />
      <div
        className="file-drop"
        data-chosen={chosen ? '' : undefined}
        data-invalid={error ? '' : undefined}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="file-icon">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
        <span className="file-name" aria-live="polite">
          {chosen ?? t('file.none')}
        </span>
        <button
          type="button"
          className="button quiet small"
          disabled={disabled}
          aria-label={t('file.aria', { label })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          data-field={name}
          onClick={() => input.current?.click()}
        >
          {buttonLabel ?? t('file.choose')}
        </button>
      </div>
      {hint && <span className="hint">{hint}</span>}
      <FieldError name={name} message={error} />
    </div>
  )
}
