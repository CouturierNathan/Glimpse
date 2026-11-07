import type { Metadata } from 'next'

import { SignInPanel } from '@/components/SignInPanel.tsx'
import { safeNextPath } from '@/lib/nav.ts'

export const metadata: Metadata = { title: 'Sign in · Glimpse' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams

  return (
    <section className="signin">
      <div>
        <h1>Sign in with your wallet</h1>
        <p className="lede">
          No password and no account to create. Your address is your identity, and your key never
          leaves your wallet.
        </p>
      </div>
      <SignInPanel next={safeNextPath(next)} />
    </section>
  )
}
