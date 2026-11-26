import type { Metadata } from 'next'

import { IssuerPanel } from '@/components/IssuerPanel.tsx'

export const metadata: Metadata = { title: 'Issue · Glimpse' }

export default function IssuerPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Issue</h1>
        <p className="who">An organisation</p>
        <p className="lede">
          For organisations. Sign one attribute for a holder&apos;s wallet and anchor it on chain:
          the holder gets the attestation, the chain only a salted commitment.
        </p>
      </header>
      <IssuerPanel />
    </section>
  )
}
