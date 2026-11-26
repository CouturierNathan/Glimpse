import { notFound } from 'next/navigation'

import { PageHead } from '@/components/PageHead.tsx'
import { RequestStatus } from '@/components/RequestStatus.tsx'
import { titled } from '@/lib/i18n/server.ts'

export const generateMetadata = titled('title.verify')

export default async function RequestStatusPage({ params }: PageProps<'/verify/[requestId]'>) {
  const { requestId } = await params
  if (!/^[0-9a-f]{32}$/.test(requestId)) notFound()

  return (
    <section>
      <PageHead title="status.title" who="who.requester" lede="status.lede" />
      <RequestStatus requestId={requestId} />
    </section>
  )
}
