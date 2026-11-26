import type { MessageKey } from '@/lib/i18n/messages.ts'

import { T } from './I18nProvider.tsx'

/** A screen's title, who it is for, and what it does. */
export function PageHead({
  title,
  who,
  lede,
}: {
  title: MessageKey
  who?: MessageKey
  lede: MessageKey
}) {
  return (
    <header className="page-head">
      {who && (
        <p className="who">
          <T k={who} />
        </p>
      )}
      <h1>
        <T k={title} />
      </h1>
      <p className="lede">
        <T k={lede} />
      </p>
    </header>
  )
}
