import type { Metadata } from 'next'
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from 'next/font/google'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { AccountButton } from '@/components/AccountButton.tsx'
import { Nav } from '@/components/Nav.tsx'
import { Providers } from '@/components/Providers.tsx'

import './globals.css'

// Variable font with its optical size axis, so the 80px hero gets the display cut, not the 14px one.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-display',
})

const body = Atkinson_Hyperlegible({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'Glimpse',
  description: 'Reveal less. Prove more.',
}

/** An aperture: a closed eye with one slit open. */
function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <rect x="6" y="13.5" width="20" height="5" rx="2.5" fill="var(--tint)" />
    </svg>
  )
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>
          <header className="header">
            <Link href="/" className="brand">
              <BrandMark />
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
