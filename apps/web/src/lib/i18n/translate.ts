import { errorTranslations, type MessageKey, messages } from './messages.ts'

export const locales = ['fr', 'en'] as const
export type Locale = (typeof locales)[number]
export const DEFAULT_LOCALE: Locale = 'fr'
/** Remembers the chosen language across reloads; read by the server to render the first paint. */
export const LOCALE_COOKIE = 'glimpse-locale'

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale)
}

/** The cookie's language, else the browser's first supported one, else French. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.trim().slice(0, 2).toLowerCase()
    if (isLocale(tag)) return tag
  }
  return DEFAULT_LOCALE
}

export type Vars = Record<string, string | number>

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const text: string = messages[locale][key]
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/** An English message from a server route or a library, in the chosen language when known. */
export function translateError(locale: Locale, message: string): string {
  if (locale === 'en') return message
  return errorTranslations[message] ?? message
}

/** The BCP 47 tag dates and numbers are written with. */
export const intlLocale = (locale: Locale) => (locale === 'fr' ? 'fr-FR' : 'en-GB')
