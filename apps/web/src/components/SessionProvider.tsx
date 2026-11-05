'use client'

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { type Address, UserRejectedRequestError } from 'viem'
import { createSiweMessage } from 'viem/siwe'
import { ProviderNotFoundError } from 'wagmi'
import { connect, disconnect, getConnection, signMessage } from 'wagmi/actions'

import { SIWE_MESSAGE_TTL_MS } from '@/lib/auth/siwe.ts'
import { appChain } from '@/lib/chains.ts'
import { wagmiConfig } from '@/lib/wagmi.ts'

type Status = 'loading' | 'signed-out' | 'signing-in' | 'signed-in'

interface SessionContextValue {
  status: Status
  address: Address | null
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

async function connectedAddress(): Promise<Address> {
  const connection = getConnection(wagmiConfig)
  if (connection.status === 'connected') return connection.address
  const [connector] = wagmiConfig.connectors
  if (!connector) throw new ProviderNotFoundError()
  const { accounts } = await connect(wagmiConfig, { connector })
  return accounts[0]
}

function describe(error: unknown): string {
  if (error instanceof ProviderNotFoundError) {
    return 'No browser wallet found. Install MetaMask or another Ethereum wallet.'
  }
  if (error instanceof Error && error.cause instanceof UserRejectedRequestError) {
    return 'You cancelled the request in your wallet.'
  }
  if (error instanceof UserRejectedRequestError) return 'You cancelled the request in your wallet.'
  return error instanceof Error ? error.message : 'Sign-in failed, try again.'
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [address, setAddress] = useState<Address | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json() as Promise<{ address: Address | null }>)
      .then(({ address }) => {
        setAddress(address)
        setStatus(address ? 'signed-in' : 'signed-out')
      })
      .catch(() => setStatus('signed-out'))
  }, [])

  const signIn = useCallback(async () => {
    setStatus('signing-in')
    setError(null)
    try {
      const account = await connectedAddress()
      const { nonce } = (await (await fetch('/api/auth/nonce')).json()) as { nonce: string }
      const issuedAt = new Date()
      const message = createSiweMessage({
        address: account,
        chainId: appChain.id,
        domain: window.location.host,
        uri: window.location.origin,
        nonce,
        version: '1',
        statement: 'Sign in to Glimpse. This request does not send a transaction or cost gas.',
        issuedAt,
        expirationTime: new Date(issuedAt.getTime() + SIWE_MESSAGE_TTL_MS),
      })
      const signature = await signMessage(wagmiConfig, { message })

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      })
      const body = (await res.json()) as { address?: Address; error?: string }
      if (!res.ok || !body.address) throw new Error(body.error ?? 'Sign-in failed, try again.')

      setAddress(body.address)
      setStatus('signed-in')
    } catch (err) {
      setError(describe(err))
      setStatus('signed-out')
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    await disconnect(wagmiConfig).catch(() => undefined)
    setAddress(null)
    setStatus('signed-out')
  }, [])

  return (
    <SessionContext value={{ status, address, error, signIn, signOut }}>{children}</SessionContext>
  )
}
