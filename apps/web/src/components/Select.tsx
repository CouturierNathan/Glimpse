import type { ReactNode, SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: ReactNode
}

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: readonly SelectOption[]
}

/**
 * The one dropdown of the app.
 *
 * It stays a native `<select>`: it is the control every browser, screen reader and phone already
 * knows, and a hand-built listbox would have to re-earn all of that. What changes is the frame
 * around it — the browser's own arrow is hidden and one drawn in the app's ink takes its place,
 * so the control matches the inputs beside it instead of looking like a system widget dropped on
 * the page. The option list is still the platform's, which is why it is the right trade.
 */
export function Select({ options, className, ...props }: Props) {
  return (
    <span className={`select${className ? ` ${className}` : ''}`}>
      <select {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="select-arrow">
        <path d="m4 6.5 4 4 4-4" />
      </svg>
    </span>
  )
}
