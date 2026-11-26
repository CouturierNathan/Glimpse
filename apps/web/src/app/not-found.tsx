import Link from 'next/link'

import { T } from '@/components/I18nProvider.tsx'

export default function NotFound() {
  return (
    <section className="not-found">
      <h1>
        <T k="notFound.title" />
      </h1>
      <p className="lede">
        <T k="notFound.text" />
      </p>
      <p>
        <Link href="/" className="button">
          <T k="notFound.cta" />
        </Link>
      </p>
    </section>
  )
}
