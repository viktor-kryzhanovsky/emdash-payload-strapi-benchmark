import { notFound } from 'next/navigation'

import { ArticleCard } from '@/components/ArticleCard'
import { Pagination } from '@/components/Pagination'
import { getCategory, listArticles } from '@/lib/data'
import type { Locale } from '@/lib/i18n'

// Shared by the dynamic route (page from ?page=) and the cached one (page from the path).
export async function CategoryView({ locale, slug, page }: { locale: Locale; slug: string; page: number }) {
  const category = await getCategory(locale, slug)
  if (!category) notFound()
  const { items, totalPages } = await listArticles(locale, category.id, page)

  return (
    <section className="section">
      <h1>{category.title}</h1>
      <div className="articles-grid">
        {items.map((article) => (
          <ArticleCard key={article.id} locale={locale} article={article} />
        ))}
      </div>
      <Pagination locale={locale} page={page} totalPages={totalPages} baseHref={`/${locale}/category/${slug}`} />
    </section>
  )
}
