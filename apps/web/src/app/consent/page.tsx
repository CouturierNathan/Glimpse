import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Requests · Glimpse' }

export default function ConsentPage() {
  return (
    <section>
      <h1>Requests</h1>
      <p>Requesters ask for one precise attribute. You accept or refuse each request.</p>
    </section>
  )
}
