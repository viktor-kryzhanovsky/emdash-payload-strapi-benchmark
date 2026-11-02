import { CategoryView } from '@/components/CategoryView'
import { parsePage, type Locale } from '@/lib/i18n'

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { locale, slug } = (await params) as { locale: Locale; slug: string }
  return <CategoryView locale={locale} slug={slug} page={parsePage((await searchParams).page)} />
}
