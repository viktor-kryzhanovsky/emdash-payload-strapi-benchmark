import { CategoryView } from '@/components/CategoryView'
import { parsePage, type Locale } from '@/lib/i18n'

// Static pages can't read ?page=, so next.config rewrites /:locale/category/:slug?page=n to this path.
export const dynamic = 'force-static'
export const revalidate = false

export default async function CachedCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; page: string }>
}) {
  const { locale, slug, page } = (await params) as { locale: Locale; slug: string; page: string }
  return <CategoryView locale={locale} slug={slug} page={parsePage(page)} />
}
