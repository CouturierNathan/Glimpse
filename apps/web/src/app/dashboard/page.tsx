import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Vault · Glimpse' }

export default function DashboardPage() {
  return (
    <section>
      <h1>Vault</h1>
      <p>
        Your attributes, grouped by source: imported, signature verified, or attested by an
        organisation.
      </p>
    </section>
  )
}
