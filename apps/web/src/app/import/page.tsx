import { ImportFlow } from '@/components/ImportFlow.tsx'
import { PageHead } from '@/components/PageHead.tsx'
import { titled } from '@/lib/i18n/server.ts'

export const generateMetadata = titled('title.import')

export default function ImportPage() {
  return (
    <section>
      <PageHead title="title.import" who="who.holder" lede="import.lede" />
      <ImportFlow />
    </section>
  )
}
