import Link from 'next/link'

export default function HomePage() {
  return (
    <section>
      <h1>Reveal less. Prove more.</h1>
      <p>
        Glimpse is an encrypted vault of personal attestations. You hold the keys, organisations
        sign what they vouch for, and you share one attribute at a time, only when you agree.
      </p>
      <Link href="/login" className="button">
        Sign in with Ethereum
      </Link>
    </section>
  )
}
