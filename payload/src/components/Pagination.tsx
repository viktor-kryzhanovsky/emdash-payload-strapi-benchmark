import Link from 'next/link'

import { t, type Locale } from '@/lib/i18n'

// baseHref may already contain a query string (search page).
export function Pagination({
  locale,
  page,
  totalPages,
  baseHref,
}: {
  locale: Locale
  page: number
  totalPages: number
  baseHref: string
}) {
  if (totalPages <= 1) return null
  const dict = t(locale)
  const href = (n: number) => `${baseHref}${baseHref.includes('?') ? '&' : '?'}page=${n}`

  return (
    <nav className="pagination">
      {page > 1 && (
        <Link href={href(page - 1)} aria-label={dict.previous}>
          ←
        </Link>
      )}
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) =>
        n === page ? (
          <span key={n} className="current" aria-current="page">
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)}>
            {n}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={href(page + 1)} aria-label={dict.next}>
          →
        </Link>
      )}
    </nav>
  )
}
