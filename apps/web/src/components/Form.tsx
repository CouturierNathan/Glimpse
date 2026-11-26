'use client'

import { type ReactNode, useCallback, useState } from 'react'

import { useI18n } from './I18nProvider.tsx'

/**
 * Field-level validation for every form. Forms set `noValidate`, so the browser never shows its own
 * bubbles: each problem is a message under the field it concerns, the field is marked invalid, and
 * focus moves to the first one.
 */
export type FieldErrors = Partial<Record<string, string>>

export function useFieldErrors() {
  const [errors, setErrors] = useState<FieldErrors>({})

  /** Shows the errors; returns true when there are none. */
  const report = useCallback((next: FieldErrors, form?: HTMLFormElement | null) => {
    setErrors(next)
    const first = Object.keys(next).find((key) => next[key])
    if (first && form) {
      const field = form.querySelector<HTMLElement>(`[data-field="${first}"]`)
      field?.focus()
    }
    return !first
  }, [])

  const clear = useCallback(
    (name: string) =>
      setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current)),
    [],
  )

  /** Props for the control of field `name`: invalid state, description, and clearing on input. */
  const control = (name: string) => ({
    'data-field': name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
    onInput: () => clear(name),
  })

  return { errors, report, clear, control }
}

/** The message under a field, announced when it appears. */
export function FieldError({ name, message }: { name: string; message?: string }) {
  if (!message) return null
  return (
    <p id={`${name}-error`} className="field-error" role="alert">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.8v3.6M8 10.9v.1" />
      </svg>
      {message}
    </p>
  )
}

type Tone = 'error' | 'success' | 'info'

/** One look for every alert, confirmation and notice in the app. */
export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="notice-box" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <svg viewBox="0 0 20 20" aria-hidden="true" className="notice-box-icon">
        {tone === 'success' ? (
          <path d="m5 10.5 3.2 3.2L15 7" />
        ) : (
          <>
            <circle cx="10" cy="10" r="8" />
            {tone === 'error' ? <path d="M10 6v5M10 13.8v.1" /> : <path d="M10 9v5M10 6.2v.1" />}
          </>
        )}
      </svg>
      <div>
        {title && <strong>{title}</strong>}
        {children && <div className="notice-box-text">{children}</div>}
        {action && <div className="notice-box-action">{action}</div>}
      </div>
    </div>
  )
}

/** An error message from anywhere (server, wallet, library), in the chosen language. */
export function ErrorNotice({ message, action }: { message: string | null; action?: ReactNode }) {
  const { error } = useI18n()
  if (!message) return null
  return (
    <Notice tone="error" action={action}>
      {error(message)}
    </Notice>
  )
}

/** A confirmation before a destructive action, as a modal dialog. */
export function ConfirmButton({
  label,
  title,
  text,
  confirmLabel,
  onConfirm,
  disabled,
  className = 'button quiet small danger',
}: {
  label: ReactNode
  title: string
  text: string
  confirmLabel: string
  onConfirm: () => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-text"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
          >
            <h2 id="confirm-title">{title}</h2>
            <p id="confirm-text">{text}</p>
            <div className="actions">
              <button
                type="button"
                className="button danger-solid"
                // The dialog opens on the safe choice's neighbour; Escape and the backdrop cancel.
                onClick={() => {
                  setOpen(false)
                  onConfirm()
                }}
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                className="button quiet"
                autoFocus
                onClick={() => setOpen(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
