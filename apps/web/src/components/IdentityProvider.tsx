'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { useSession } from './SessionProvider.tsx'

type IdentityStatus = 'loading' | 'verified' | 'unverified'

interface IdentityValue {
  status: IdentityStatus
  /** Asks the server again, e.g. after a binding or an IDENTITY_REQUIRED answer. */
  refresh: () => Promise<void>
}

const IdentityContext = createContext<IdentityValue | null>(null)

export function useIdentity(): IdentityValue {
  const value = useContext(IdentityContext)
  if (!value) throw new Error('useIdentity must be used inside <IdentityProvider>')
  return value
}

/**
 * Whether the signed-in holder's France Identité check is done. The screens use it to open or lock
 * the import and the attestations; the server enforces the same rule on every route.
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const { address } = useSession()
  const [status, setStatus] = useState<IdentityStatus>('loading')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/identity/status', { cache: 'no-store' })
      const body = (await res.json()) as { verified?: boolean }
      setStatus(res.ok && body.verified ? 'verified' : 'unverified')
    } catch {
      setStatus('unverified')
    }
  }, [])

  useEffect(() => {
    if (!address) {
      setStatus('unverified')
      return
    }
    setStatus('loading')
    void refresh()
  }, [address, refresh])

  return <IdentityContext value={{ status, refresh }}>{children}</IdentityContext>
}
