'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { WagmiProvider } from 'wagmi'

import type { Locale } from '@/lib/i18n/translate.ts'
import { wagmiConfig } from '@/lib/wagmi.ts'

import { I18nProvider } from './I18nProvider.tsx'
import { IdentityProvider } from './IdentityProvider.tsx'
import { SessionProvider } from './SessionProvider.tsx'
import { VaultProvider } from './VaultProvider.tsx'

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <I18nProvider initial={locale}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <IdentityProvider>
              <VaultProvider>{children}</VaultProvider>
            </IdentityProvider>
          </SessionProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </I18nProvider>
  )
}
