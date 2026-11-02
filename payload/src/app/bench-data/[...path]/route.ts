// Benchmark-only: the same Local API calls as the page at the same URL, returned as JSON
// without rendering React. /bench-data/en/category/education?page=2 mirrors /en/category/education?page=2.
// Comparing CPU per request with the real pages splits the cost into data vs rendering.
import { NextResponse, type NextRequest } from 'next/server'

import { getArticle, getCategories, getCategory, getMenu, listArticles, searchArticles } from '@/lib/data'
import { isLocale, parsePage } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const [locale, section, slug] = (await params).path
  if (!isLocale(locale)) return NextResponse.json(null, { status: 404 })
  const query = req.nextUrl.searchParams

  // the layout loads the menu on every page
  const menu = await getMenu(locale)
  let data: unknown

  if (!section) {
    const categories = await getCategories(locale)
    data = await Promise.all(
      categories.map(async (category) => ({
        category,
        articles: (await listArticles(locale, category.id, 1, 3)).items,
      })),
    )
  } else if (section === 'category' && slug) {
    const category = await getCategory(locale, slug)
    data = category && { category, ...(await listArticles(locale, category.id, parsePage(query.get('page') ?? undefined))) }
  } else if (section === 'articles' && slug) {
    data = await getArticle(locale, slug)
  } else if (section === 'search') {
    const q = query.get('q')?.trim()
    data = q ? await searchArticles(locale, q, parsePage(query.get('page') ?? undefined)) : null
  }

  if (!data) return NextResponse.json(null, { status: 404 })
  return NextResponse.json({ menu, data })
}
