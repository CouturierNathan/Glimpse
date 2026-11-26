import type { Metadata } from 'next'
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from 'next/font/google'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { AccountButton } from '@/components/AccountButton.tsx'
import { BrandMark } from '@/components/BrandMark.tsx'
import { LanguageSwitch } from '@/components/LanguageSwitch.tsx'
import { Nav } from '@/components/Nav.tsx'
import { Providers } from '@/components/Providers.tsx'
import { requestLocale } from '@/lib/i18n/server.ts'
import { translate } from '@/lib/i18n/translate.ts'

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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale()
  return {
    title: { default: 'Glimpse', template: '%s · Glimpse' },
    description: translate(locale, 'meta.description'),
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await requestLocale()

  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers locale={locale}>
          <header className="header">
            <div className="header-inner">
              <Link href="/" className="brand" aria-label="Glimpse">
                <BrandMark />
                <span aria-hidden="true">Glimpse</span>
              </Link>
              <Nav />
              <div className="header-tools">
                <LanguageSwitch />
                <AccountButton />
              </div>
            </div>
          </header>
          <main className="main">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
