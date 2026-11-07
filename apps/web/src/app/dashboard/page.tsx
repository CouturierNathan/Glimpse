import type { Metadata } from 'next'
import { VaultList } from '@/components/VaultList.tsx'

export const metadata: Metadata = { title: 'Vault · Glimpse' }

export default function DashboardPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Vault</h1>
        <p className="lede">
          Your attributes, each marked with where it comes from. Only you can open them.
        </p>
      </header>

      <VaultList />

      <h2 className="section-title">How much each source proves</h2>
      <ul className="sources">
        <li>
          <span className="mark" aria-hidden="true" />
          <div>
            <h3>Imported</h3>
            <p>Read from a document you added. Useful to you, but nobody vouches for it yet.</p>
          </div>
        </li>
        <li>
          <span className="mark signed" aria-hidden="true" />
          <div>
            <h3>Signature verified</h3>
            <p>The document carries a digital signature, and Glimpse checked it.</p>
          </div>
        </li>
        <li>
          <span className="mark attested" aria-hidden="true" />
          <div>
            <h3>Attested by an organisation</h3>
            <p>An organisation signed this attribute and anchored it on chain.</p>
          </div>
        </li>
      </ul>
    </section>
  )
}
