import type { Metadata } from 'next'
import { AttestationImport } from '@/components/AttestationImport.tsx'
import { StatusLegend } from '@/components/StatusBadge.tsx'
import { VaultList } from '@/components/VaultList.tsx'
import { storageMode } from '@/lib/vault/server.ts'

export const metadata: Metadata = { title: 'Vault · Glimpse' }

export default async function DashboardPage() {
  const mode = await storageMode()

  return (
    <section>
      <header className="page-head">
        <h1>Vault</h1>
        <p className="who">You, the holder</p>
        <p className="lede">
          Your attributes, each marked with where it comes from. Only you can open them.
        </p>
      </header>

      {mode === 'memory' && (
        <p className="notice">
          This server keeps the encrypted items in its own memory, not on a disk. Everything below
          works, and nothing is less private — the ciphertext simply does not outlive the server.
          Restart it and the items are gone.
        </p>
      )}

      <VaultList />
      <AttestationImport />

      <h2 className="section-title">What each status means</h2>
      <StatusLegend />

      <h2 className="section-title">Where your attributes come from</h2>
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
