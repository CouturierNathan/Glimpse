import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Import · Glimpse' }

export default function ImportPage() {
  return (
    <section>
      <h1>Import</h1>
      <p>
        Add a France Identité proof or a document. Extracted attributes stay marked as imported
        until a signature or an organisation backs them.
      </p>
    </section>
  )
}
