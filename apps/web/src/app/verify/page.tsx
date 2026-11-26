import { PageHead } from '@/components/PageHead.tsx'
import { VerifyPanel } from '@/components/VerifyPanel.tsx'
import { titled } from '@/lib/i18n/server.ts'

export const generateMetadata = titled('title.verify')

export default function VerifyPage() {
  return (
    <section>
      <PageHead title="title.verify" who="who.requester" lede="verify.lede" />
      <VerifyPanel />
    </section>
  )
}
