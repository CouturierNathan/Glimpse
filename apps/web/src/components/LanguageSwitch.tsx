'use client'

import { locales } from '@/lib/i18n/translate.ts'

import { useI18n } from './I18nProvider.tsx'

/** FR | EN. The choice applies at once and is kept in a cookie. */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div className="lang" role="group" aria-label={t('lang.label')}>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={locale === option}
          onClick={() => locale !== option && setLocale(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
