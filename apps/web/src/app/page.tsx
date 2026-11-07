import Link from 'next/link'

import { StatusBadge } from '@/components/StatusBadge.tsx'

/** Every line of the attestation stays masked except the one the requester asked for. */
const hiddenRows = [
  { label: 'Full name', width: '72%' },
  { label: 'Date of birth', width: '44%' },
  { label: 'Home address', width: '88%' },
]

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>Reveal less. Prove more.</h1>
          <p className="lede">
            Glimpse is an encrypted vault of personal attestations. You hold the keys, and you share
            one attribute at a time, only when you agree.
          </p>
          <Link href="/login" className="button">
            Sign in with Ethereum
          </Link>
        </div>

        <figure className="doc" aria-label="Example: an attestation where only one line is shared">
          <div className="doc-head">
            <h2>Identity attestation</h2>
            <span>Shared with a requester</span>
          </div>
          <dl>
            {hiddenRows.map((row) => (
              <div className="doc-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  <span className="redacted" style={{ width: row.width }} />
                  <span className="sr-only">hidden</span>
                </dd>
              </div>
            ))}
            <div className="doc-row revealed">
              <dt>Over 18</dt>
              <dd>Yes</dd>
            </div>
          </dl>
          <figcaption className="doc-foot">
            <StatusBadge status="authentic" />
            Signed by the issuer, checked on chain by the requester.
          </figcaption>
        </figure>
      </section>

      <ol className="steps">
        <li>
          <h2>An organisation signs</h2>
          <p>Your bank, school or employer attests a fact about you and anchors it on chain.</p>
        </li>
        <li>
          <h2>You keep it encrypted</h2>
          <p>The attestation lands in your vault. Only your wallet holds the key that opens it.</p>
        </li>
        <li>
          <h2>You share one line</h2>
          <p>A requester asks for one attribute. You agree, and they verify it on their own.</p>
        </li>
      </ol>
    </>
  )
}
