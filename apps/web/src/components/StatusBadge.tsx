import { type Status, statusCopy, statuses } from '@/lib/status.ts'

/** Each status has its own shape, so it never relies on colour alone. */
function Glyph({ status }: { status: Status }) {
  switch (status) {
    case 'authentic':
      return <path d="m4 8.2 2.6 2.6L12 5.4" />
    case 'declared':
      return <path d="M5 4.5h6M5 8h6M5 11.5h3.5" />
    case 'expired':
      return (
        <>
          <circle cx="8" cy="8" r="5" />
          <path d="M8 5.5V8l1.8 1.2" />
        </>
      )
    case 'revoked':
      return <path d="m5 5 6 6M11 5l-6 6" />
    case 'undetermined':
      return <path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.3M8 11.6v.2" />
  }
}

export function StatusBadge({ status }: { status: Status }) {
  const { label, meaning } = statusCopy[status]
  return (
    <span className="status" data-status={status} title={meaning}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <Glyph status={status} />
      </svg>
      {label}
    </span>
  )
}

/** What each status means, with the badge the holder sees on items. */
export function StatusLegend() {
  return (
    <dl className="legend">
      {statuses.map((status) => (
        <div key={status}>
          <dt>
            <StatusBadge status={status} />
          </dt>
          <dd>{statusCopy[status].meaning}</dd>
        </div>
      ))}
    </dl>
  )
}
