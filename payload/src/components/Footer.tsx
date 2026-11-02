import Link from 'next/link'

import type { Menu } from '@/payload-types'
import { t, type Locale } from '@/lib/i18n'
import { isExternal, menuHref } from './menu'

export function Footer({ locale, menu }: { locale: Locale; menu: Menu }) {
  return (
    <footer className="footer">
      <nav className="footer-nav">
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
      <p className="copy">
        © {new Date().getFullYear()} {t(locale).rights}
      </p>
    </footer>
  )
}
