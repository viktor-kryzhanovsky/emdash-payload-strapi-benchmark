// Loads ../data/articles.json through the Local API.
// Upserts by slug, so it can be re-run and leaves content created by hand alone.
// Run: pnpm seed
import config from '@payload-config'
import fs from 'fs'
import path from 'path'
import { getPayload } from 'payload'

import type { Locale } from './lib/i18n'

type Dataset = {
  locales: Locale[]
  categories: { key: string; slug: string; title: Record<Locale, string> }[]
  covers: { file: string; alt: string }[]
  articles: {
    slug: string
    category: string
    author: string
    publishedAt: string
    cover: string
    locales: Record<Locale, { title: string; excerpt: string; body: string[] }>
  }[]
}

const DATA_FILE = process.env.SEED_FILE || path.resolve(process.cwd(), '../data/articles.json')

// Minimal Lexical document: one paragraph node per string.
const lexical = (paragraphs: string[]) => ({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 0,
      children: [{ type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' }],
    })),
  },
})

const data: Dataset = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
const payload = await getPayload({ config })
const [first, ...rest] = data.locales

async function findIdBySlug(collection: 'articles' | 'categories', slug: string) {
  const res = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, pagination: false, depth: 0 })
  return res.docs[0]?.id
}

// Covers are uploaded once; a re-run finds them by file name.
const coverIds: Record<string, number> = {}
for (const c of data.covers) {
  const filename = path.basename(c.file)
  const found = await payload.find({ collection: 'media', where: { filename: { equals: filename } }, limit: 1, depth: 0 })
  const doc =
    found.docs[0] ??
    (await payload.create({ collection: 'media', data: { alt: c.alt }, filePath: path.resolve(path.dirname(DATA_FILE), c.file) }))
  coverIds[c.file] = doc.id
}

const categoryIds: Record<string, number> = {}
for (const c of data.categories) {
  let id = await findIdBySlug('categories', c.slug)
  for (const locale of data.locales) {
    const doc = id
      ? await payload.update({ collection: 'categories', id, locale, data: { title: c.title[locale] } })
      : await payload.create({ collection: 'categories', locale, data: { title: c.title[locale], slug: c.slug } })
    id = doc.id
  }
  categoryIds[c.key] = id!
}

// Menu: one item per category, only if the menu is still empty (keeps manual edits).
const menu = await payload.findGlobal({ slug: 'menu', depth: 0 })
if (!menu.items?.length) {
  let saved = await payload.updateGlobal({
    slug: 'menu',
    locale: first,
    data: {
      items: data.categories.map((c) => ({ type: 'category' as const, category: categoryIds[c.key], label: c.title[first] })),
    },
  })
  // Array rows are shared between locales: other locales update labels on the same row ids.
  for (const locale of rest) {
    saved = await payload.updateGlobal({
      slug: 'menu',
      locale,
      data: {
        items: (saved.items ?? []).map((item, i) => ({ ...item, label: data.categories[i].title[locale] })),
      },
    })
  }
}

for (const a of data.articles) {
  const localized = (locale: Locale) => ({
    title: a.locales[locale].title,
    excerpt: a.locales[locale].excerpt,
    body: lexical(a.locales[locale].body),
  })
  const shared = {
    slug: a.slug,
    author: a.author,
    date: a.publishedAt,
    category: categoryIds[a.category],
    cover: coverIds[a.cover],
  }
  const existing = await findIdBySlug('articles', a.slug)
  const doc = existing
    ? await payload.update({ collection: 'articles', id: existing, locale: first, data: { ...localized(first), ...shared } })
    : await payload.create({ collection: 'articles', locale: first, data: { ...localized(first), ...shared } })
  for (const locale of rest) {
    await payload.update({ collection: 'articles', id: doc.id, locale, data: localized(locale) })
  }
}

const { totalDocs } = await payload.count({ collection: 'articles' })
console.log(`seeded ${data.articles.length} articles x ${data.locales.length} locales (${totalDocs} articles in total)`)
process.exit(0)
