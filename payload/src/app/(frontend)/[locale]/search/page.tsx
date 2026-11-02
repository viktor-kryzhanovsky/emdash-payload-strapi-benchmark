import { ArticleCard } from '@/components/ArticleCard'
import { Pagination } from '@/components/Pagination'
import { searchArticles } from '@/lib/data'
import { parsePage, t, type Locale } from '@/lib/i18n'

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const locale = (await params).locale as Locale
  const query = await searchParams
  const q = (query.q ?? '').trim()
  const dict = t(locale)
  const result = q ? await searchArticles(locale, q, parsePage(query.page)) : null

  return (
    <section className="section">
      <h1>{q ? dict.searchResults(q) : dict.search}</h1>
      <form className="search-form" action={`/${locale}/search`}>
        <input type="search" name="q" defaultValue={q} placeholder={dict.searchPlaceholder} />
        <button type="submit" className="button">
          {dict.search}
        </button>
      </form>
      {result && result.items.length === 0 && <p className="empty">{dict.nothingFound}</p>}
      {result && (
        <>
          <div className="articles-grid">
            {result.items.map((article) => (
              <ArticleCard key={article.id} locale={locale} article={article} />
            ))}
          </div>
          <Pagination
            locale={locale}
            page={result.page}
            totalPages={result.totalPages}
            baseHref={`/${locale}/search?q=${encodeURIComponent(q)}`}
          />
        </>
      )}
    </section>
  )
}
