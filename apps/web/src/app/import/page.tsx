import type { Metadata } from 'next'

import { ImportPanel } from '@/components/ImportPanel.tsx'

export const metadata: Metadata = { title: 'Import · Glimpse' }

export default function ImportPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Import</h1>
        <p className="lede">
          Add a document and choose what to read from it. The attributes stay marked as imported
          until a signature or an organisation backs them.
        </p>
      </header>

      <ImportPanel />
    </section>
  )
}
