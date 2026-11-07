import type { Metadata } from 'next'

import { VerifyPanel } from '@/components/VerifyPanel.tsx'

export const metadata: Metadata = { title: 'Verify · Glimpse' }

export default function VerifyPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Verify</h1>
        <p className="lede">
          Ask someone for one attribute. You sign the request with your wallet, they decide, and
          your browser checks what they share against the chain.
        </p>
      </header>
      <VerifyPanel />
    </section>
  )
}
