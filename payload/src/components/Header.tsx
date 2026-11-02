import Link from 'next/link'

import type { Menu } from '@/payload-types'
import { t, type Locale } from '@/lib/i18n'
import { LangSwitcher } from './LangSwitcher'
import { isExternal, menuHref } from './menu'

export function Header({ locale, menu }: { locale: Locale; menu: Menu }) {
  const dict = t(locale)

  return (
    <header className="header">
      <Link href={`/${locale}`} className="brand">
        Blog
      </Link>
      <nav className="main-nav">
        <ul>
          {menu.items?.map((item) => {
            const href = menuHref(locale, item)
            return (
              <li key={item.id}>
                {isExternal(href) ? (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {item.label}
                  </a>
                ) : (
                  <Link href={href}>{item.label}</Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
      <form className="header-search" action={`/${locale}/search`}>
        <input type="search" name="q" placeholder={dict.searchPlaceholder} aria-label={dict.search} />
      </form>
      <LangSwitcher locale={locale} />
    </header>
  )
}
