import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'

import type { MessageKey } from './messages.ts'
import { LOCALE_COOKIE, type Locale, pickLocale, translate } from './translate.ts'

/** The language of this request: the saved choice, else the browser's. */
export async function requestLocale(): Promise<Locale> {
  const [jar, list] = await Promise.all([cookies(), headers()])
  return pickLocale(jar.get(LOCALE_COOKIE)?.value, list.get('accept-language'))
}

/** A page's `generateMetadata`: its title in the request's language. */
export function titled(key: MessageKey) {
  return async (): Promise<Metadata> => {
    const locale = await requestLocale()
    return { title: translate(locale, key) }
  }
}
