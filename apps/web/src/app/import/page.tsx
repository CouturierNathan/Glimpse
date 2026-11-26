import type { Metadata } from 'next'

import { IdentityPanel } from '@/components/IdentityPanel.tsx'
import { ImportPanel } from '@/components/ImportPanel.tsx'

export const metadata: Metadata = { title: 'Import · Glimpse' }

export default function ImportPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Import</h1>
        <p className="who">You, the holder</p>
        <p className="lede">
          Check your France Identité proof and bind it to your wallet, then add a document and
          choose what to read from it. The attributes stay marked as imported until a verified
          signature or an organisation backs them.
        </p>
      </header>

      <h2 className="section-title">Your France Identité proof</h2>
      <IdentityPanel />

      <h2 className="section-title">A document</h2>
      <ImportPanel />
    </section>
  )
}
