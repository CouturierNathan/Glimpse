import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { AccountButton } from '@/components/AccountButton.tsx'
import { Nav } from '@/components/Nav.tsx'
import { Providers } from '@/components/Providers.tsx'

import './globals.css'

export const metadata: Metadata = {
  title: 'Glimpse',
  description: 'Reveal less. Prove more.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="header">
            <Link href="/" className="brand">
              Glimpse
            </Link>
            <Nav />
            <AccountButton />
          </header>
          <main className="main">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
