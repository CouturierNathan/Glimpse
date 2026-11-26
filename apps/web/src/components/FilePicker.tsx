'use client'

import { type ChangeEvent, useId, useRef, useState } from 'react'

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
  buttonLabel = 'Choose a file',
  onPick,
}: FilePickerProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    setChosen(file?.name ?? null)
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
      <div className="file-row">
        <button
          type="button"
          className="button quiet"
          disabled={disabled}
          aria-label={`${label}: choose a file`}
          onClick={() => input.current?.click()}
        >
          {buttonLabel}
        </button>
        <span className="file-name" aria-live="polite">
          {chosen ?? 'No file chosen'}
        </span>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
