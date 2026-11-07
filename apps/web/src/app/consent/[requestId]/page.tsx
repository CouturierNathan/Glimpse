import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RequestReview } from '@/components/RequestReview.tsx'

export const metadata: Metadata = { title: 'Request · Glimpse' }

export default async function RequestPage({ params }: PageProps<'/consent/[requestId]'>) {
  const { requestId } = await params
  if (!/^[0-9a-f]{32}$/.test(requestId)) notFound()

  return (
    <section>
      <header className="page-head">
        <h1>A request for one attribute</h1>
        <p className="lede">
          Read who asks and why. You share one value, or nothing: the rest of your vault stays
          closed.
        </p>
      </header>
      <RequestReview requestId={requestId} />
    </section>
  )
}
