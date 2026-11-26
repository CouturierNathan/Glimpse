import { IssuerPanel } from '@/components/IssuerPanel.tsx'
import { PageHead } from '@/components/PageHead.tsx'
import { titled } from '@/lib/i18n/server.ts'

export const generateMetadata = titled('title.issue')

export default function IssuerPage() {
  return (
    <section>
      <PageHead title="title.issue" who="who.organisation" lede="issue.lede" />
      <IssuerPanel />
    </section>
  )
}
