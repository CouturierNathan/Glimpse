'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useSession } from './SessionProvider.tsx'

export function SignInPanel({ next }: { next: Route }) {
  const { status, error, signIn } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'signed-in') router.replace(next)
  }, [status, next, router])

  const busy = status === 'loading' || status === 'signing-in' || status === 'signed-in'

  return (
    <div className="panel">
      <ol>
        <li>
          <div>
            <strong>Connect your wallet</strong>
            <span>MetaMask or any browser wallet.</span>
          </div>
        </li>
        <li>
          <div>
            <strong>Sign the message</strong>
            <span>It proves you own the address. No transaction, no gas.</span>
          </div>
        </li>
      </ol>
      <button type="button" className="button" onClick={signIn} disabled={busy}>
        {status === 'signing-in' ? 'Check your wallet…' : 'Connect wallet and sign in'}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
