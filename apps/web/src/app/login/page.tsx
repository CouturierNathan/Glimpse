import type { Metadata } from 'next'

import { SignInPanel } from '@/components/SignInPanel.tsx'
import { safeNextPath } from '@/lib/nav.ts'

export const metadata: Metadata = { title: 'Sign in · Glimpse' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams

  return (
    <section>
      <h1>Sign in</h1>
      <p>
        Connect your wallet and sign a Sign-In with Ethereum message. No password, no account, no
        transaction: your address is your identity, and your key never leaves your wallet.
      </p>
      <SignInPanel next={safeNextPath(next)} />
    </section>
  )
}
