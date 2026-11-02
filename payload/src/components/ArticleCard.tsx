import Link from 'next/link'

import type { ArticleCard as Card } from '@/lib/data'
import { formatDate, t, type Locale } from '@/lib/i18n'

export function ArticleCard({ locale, article }: { locale: Locale; article: Card }) {
  const href = `/${locale}/articles/${article.slug}`
  const cover = typeof article.cover === 'object' ? article.cover : null

  return (
    <article className="card">
      <Link href={href} className="poster" tabIndex={-1}>
        {cover?.url ? (
          // Plain <img>: no image optimizer in the request path while benchmarking.
          <img src={cover.url} alt={cover.alt} width={cover.width ?? undefined} height={cover.height ?? undefined} />
        ) : (
          <span className="poster-placeholder">
            {typeof article.category === 'object' ? article.category.title : ''}
          </span>
        )}
      </Link>
      <div className="intro">
        <h3>
          <Link href={href}>{article.title}</Link>
        </h3>
        {article.excerpt && <p>{article.excerpt}</p>}
        <ArticleMeta locale={locale} date={article.date} readingTime={article.readingTime} />
      </div>
    </article>
  )
}

export function ArticleMeta({
  locale,
  date,
  readingTime,
}: {
  locale: Locale
  date: string
  readingTime?: number | null
}) {
  return (
    <div className="meta">
      <time dateTime={date}>{formatDate(locale, date)}</time>
      {readingTime ? (
        <span className="reading-time">
          {readingTime} {t(locale).minutes}
        </span>
      ) : null}
    </div>
  )
}
