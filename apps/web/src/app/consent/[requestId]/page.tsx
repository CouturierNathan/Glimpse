import { notFound } from 'next/navigation'

import { PageHead } from '@/components/PageHead.tsx'
import { RequestReview } from '@/components/RequestReview.tsx'
import { titled } from '@/lib/i18n/server.ts'

export const generateMetadata = titled('title.request')

export default async function RequestPage({ params }: PageProps<'/consent/[requestId]'>) {
  const { requestId } = await params
  if (!/^[0-9a-f]{32}$/.test(requestId)) notFound()

  return (
    <section>
      <PageHead title="request.title" who="who.holder" lede="request.lede" />
      <RequestReview requestId={requestId} />
    </section>
  )
}
