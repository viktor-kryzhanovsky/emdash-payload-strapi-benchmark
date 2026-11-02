import { RichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ArticleMeta } from '@/components/ArticleCard'
import { getArticle } from '@/lib/data'
import { t, type Locale } from '@/lib/i18n'

export default async function ArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string }
  const article = await getArticle(locale, slug)
  if (!article) notFound()
  const category = typeof article.category === 'object' ? article.category : null
  const cover = typeof article.cover === 'object' ? article.cover : null

  return (
    <article className="single-article">
      {category && (
        <Link href={`/${locale}/category/${category.slug}`} className="tag">
          {category.title}
        </Link>
      )}
      <h1>{article.title}</h1>
      <ArticleMeta locale={locale} date={article.date} readingTime={article.readingTime} />
      {cover?.url && (
        <img className="cover" src={cover.url} alt={cover.alt} width={cover.width ?? undefined} height={cover.height ?? undefined} />
      )}
      {article.excerpt && <p className="lead">{article.excerpt}</p>}
      {article.body && <RichText data={article.body} className="content" />}
      {article.author && (
        <p className="author">
          {t(locale).by} {article.author}
        </p>
      )}
    </article>
  )
}
