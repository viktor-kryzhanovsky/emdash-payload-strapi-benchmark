import type { Menu } from '@/payload-types'
import type { Locale } from '@/lib/i18n'

type MenuItem = NonNullable<Menu['items']>[number]

export const menuHref = (locale: Locale, item: MenuItem) =>
  item.type === 'custom'
    ? (item.url ?? '#')
    : typeof item.category === 'object' && item.category
      ? `/${locale}/category/${item.category.slug}`
      : '#'

export const isExternal = (href: string) => /^https?:\/\//.test(href)
