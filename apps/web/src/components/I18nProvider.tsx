'use client'

import { useRouter } from 'next/navigation'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

import { type MessageKey, messages } from '@/lib/i18n/messages.ts'
import {
  intlLocale,
  LOCALE_COOKIE,
  type Locale,
  translate,
  translateError,
  type Vars,
} from '@/lib/i18n/translate.ts'

interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Vars) => string
  /** An attribute's name, e.g. `full_name` → `Full name`. */
  attr: (attribute: string) => string
  /** An error message, translated when the app knows it. */
  error: (message: string) => string
  date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}

/** A message in a server component: re-renders in place when the language changes. */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  return useI18n().t(k, vars)
}

const ONE_YEAR = 60 * 60 * 24 * 365

export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setState] = useState(initial)
  const router = useRouter()

  const setLocale = useCallback(
    (next: Locale) => {
      setState(next)
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`
      document.documentElement.lang = next
      // Server-rendered parts (page titles) follow on the next render; the rest switched already.
      router.refresh()
    },
    [router],
  )

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      attr: (attribute) => {
        const key = `attr.${attribute}` as MessageKey
        return Object.hasOwn(messages.en, key) ? translate(locale, key) : attribute
      },
      error: (message) => translateError(locale, message),
      date: (value, options) => new Date(value).toLocaleString(intlLocale(locale), options),
    }),
    [locale, setLocale],
  )

  return <I18nContext value={value}>{children}</I18nContext>
}
