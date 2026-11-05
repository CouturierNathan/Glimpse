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
