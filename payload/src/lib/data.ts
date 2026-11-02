// Data layer: Payload Local API (direct DB access in the same process, no HTTP).
import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'

import type { Article, Category, Media, Menu } from '@/payload-types'
import type { Locale } from './i18n'
import { TAGS } from './revalidate'

// CMS_CACHE=data: Local API results go to Next's data cache (arguments are part of the key)
// and are invalidated by tag from collection hooks, see ./revalidate.ts. Search is never cached.
const DATA_CACHE = process.env.CMS_CACHE === 'data'

const cached = <A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string, tags: string[]) =>
  DATA_CACHE ? unstable_cache(fn, [key], { tags }) : fn

export const PAGE_SIZE = 6

export type ArticleCard = Pick<Article, 'id' | 'title' | 'slug' | 'excerpt' | 'date' | 'readingTime'> & {
  cover?: Media | number | null
  category: Category | number
}

export type Paged<T> = { items: T[]; page: number; totalPages: number }

const cardSelect = {
  title: true,
  slug: true,
  excerpt: true,
  cover: true,
  date: true,
  readingTime: true,
  category: true,
} as const

// Relations are returned as objects (depth: 1), trimmed to the fields we render.
// Media `url` is virtual (built from `filename` on read), so `filename` must be selected too.
const populate = {
  categories: { title: true, slug: true },
  media: { filename: true, url: true, alt: true, width: true, height: true },
} as const

// Cards and articles embed category titles and media, so they depend on those tags too.
const ARTICLE_TAGS = [TAGS.articles, TAGS.categories, TAGS.media]

export const getMenu = cached(
  async (locale: Locale) => {
    const payload = await getPayload({ config })
    return (await payload.findGlobal({ slug: 'menu', locale, depth: 1, populate })) as Menu
  },
  'menu',
  [TAGS.menu, TAGS.categories],
)

export const getCategories = cached(
  async (locale: Locale) => {
    const payload = await getPayload({ config })
    const res = await payload.find({ collection: 'categories', locale, sort: 'createdAt', pagination: false })
    return res.docs
  },
  'categories',
  [TAGS.categories],
)

export const getCategory = cached(
  async (locale: Locale, slug: string) => {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'categories',
      locale,
      where: { slug: { equals: slug } },
      limit: 1,
      pagination: false,
    })
    return res.docs[0] ?? null
  },
  'category',
  [TAGS.categories],
)

async function findArticles(locale: Locale, where: Where, page: number, limit: number): Promise<Paged<ArticleCard>> {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'articles',
    locale,
    where,
    sort: '-date',
    page,
    limit,
    depth: 1,
    select: cardSelect,
    populate,
  })
  return { items: res.docs as ArticleCard[], page: res.page ?? page, totalPages: res.totalPages }
}

export const listArticles = cached(
  (locale: Locale, categoryId: number, page: number = 1, limit: number = PAGE_SIZE) =>
    findArticles(locale, { category: { equals: categoryId } }, page, limit),
  'list-articles',
  ARTICLE_TAGS,
)

export const searchArticles = (locale: Locale, q: string, page = 1) =>
  findArticles(locale, { title: { contains: q } }, page, PAGE_SIZE)

export const getArticle = cached(
  async (locale: Locale, slug: string) => {
    const payload = await getPayload({ config })
    const res = await payload.find({
      collection: 'articles',
      locale,
      where: { slug: { equals: slug } },
      limit: 1,
      pagination: false,
      depth: 1,
      populate,
    })
    return (res.docs[0] as Article | undefined) ?? null
  },
  'article',
  ARTICLE_TAGS,
)
