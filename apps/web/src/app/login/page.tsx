import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sign in · Glimpse' }

export default function LoginPage() {
  return (
    <section>
      <h1>Sign in</h1>
      <p>Connect your wallet and sign a Sign-In with Ethereum message. No password, no account.</p>
    </section>
  )
}
