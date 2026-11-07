import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Import · Glimpse' }

export default function ImportPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Import</h1>
        <p className="lede">
          Add a France Identité proof or a document. Extracted attributes stay marked as imported
          until a signature or an organisation backs them.
        </p>
      </header>

      <div className="empty">
        <h2>Nothing imported yet</h2>
        <p>
          Documents are encrypted in your browser before they are stored. Glimpse never keeps a
          readable copy.
        </p>
      </div>
    </section>
  )
}
