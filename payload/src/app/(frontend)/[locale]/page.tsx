import Link from 'next/link'

import { ArticleCard } from '@/components/ArticleCard'
import { getCategories, listArticles } from '@/lib/data'
import { t, type Locale } from '@/lib/i18n'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale as Locale
  const categories = await getCategories(locale)
  const sections = await Promise.all(
    categories.map(async (category) => ({
      category,
      articles: (await listArticles(locale, category.id, 1, 3)).items,
    })),
  )

  return sections
    .filter((s) => s.articles.length > 0)
    .map(({ category, articles }) => (
      <section key={category.id} className="section">
        <h2>{category.title}</h2>
        <div className="articles-list">
          {articles.map((article) => (
            <ArticleCard key={article.id} locale={locale} article={article} />
          ))}
        </div>
        <Link href={`/${locale}/category/${category.slug}`} className="button">
          {t(locale).allIn(category.title)}
        </Link>
      </section>
    ))
}
