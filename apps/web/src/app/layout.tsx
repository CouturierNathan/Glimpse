import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Nav } from '@/components/Nav.tsx'

import './globals.css'

export const metadata: Metadata = {
  title: 'Glimpse',
  description: 'Reveal less. Prove more.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <Link href="/" className="brand">
            Glimpse
          </Link>
          <Nav />
          <Link href="/login" className="button">
            Sign in
          </Link>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  )
}
