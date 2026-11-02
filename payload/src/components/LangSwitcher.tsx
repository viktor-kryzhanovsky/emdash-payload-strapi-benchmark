'use client'

import { usePathname } from 'next/navigation'

import { LOCALES, type Locale } from '@/lib/i18n'

// Keeps the current page and swaps the locale segment: /en/articles/x -> /uk/articles/x
export function LangSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? `/${locale}`
  const rest = pathname.split('/').slice(2).join('/')

  return (
    <div className="lang-switcher">
      {LOCALES.map((code) =>
        code === locale ? (
          <span key={code} className="active">
            {code}
          </span>
        ) : (
          <a key={code} href={`/${code}${rest ? `/${rest}` : ''}`} hrefLang={code}>
            {code}
          </a>
        ),
      )}
    </div>
  )
}
