'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { WagmiProvider } from 'wagmi'

import { wagmiConfig } from '@/lib/wagmi.ts'

import { SessionProvider } from './SessionProvider.tsx'
import { VaultProvider } from './VaultProvider.tsx'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <VaultProvider>{children}</VaultProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
