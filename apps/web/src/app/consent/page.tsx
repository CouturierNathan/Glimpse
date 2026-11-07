import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Requests · Glimpse' }

export default function ConsentPage() {
  return (
    <section>
      <header className="page-head">
        <h1>Requests</h1>
        <p className="lede">
          Requesters ask for one precise attribute. You accept or refuse each request.
        </p>
      </header>

      <div className="empty">
        <h2>No requests waiting</h2>
        <p>When someone asks to check an attribute, the request shows up here for your answer.</p>
      </div>
    </section>
  )
}
