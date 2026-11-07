import type { Metadata } from 'next'

import { OpenRequest } from '@/components/OpenRequest.tsx'
import { StatusLegend } from '@/components/StatusBadge.tsx'

export const metadata: Metadata = { title: 'Requests · Glimpse' }

export default function ConsentPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Requests</h1>
        <p className="lede">
          Requesters ask for one precise attribute. You accept or refuse each request.
        </p>
      </header>

      <div className="empty">
        <h2>Open a request</h2>
        <p>A requester sends you a link. Open it directly, or paste it here.</p>
        <OpenRequest />
      </div>

      <h2 className="section-title">What a requester can conclude</h2>
      <p className="lede">
        The requester checks what you share on its own, against the chain, and reaches one of these
        statuses.
      </p>
      <StatusLegend />
    </section>
  )
}
