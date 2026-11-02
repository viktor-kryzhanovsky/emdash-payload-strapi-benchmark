// Cache tags for the data cache (CMS_CACHE=data, see ./data.ts) and the hooks that expire them.
// One tag per collection: any change invalidates every cached read of that collection,
// the same granularity as EmDash's per-collection cache epochs.
import { revalidatePath, revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook } from 'payload'

export const TAGS = {
  articles: 'articles',
  categories: 'categories',
  media: 'media',
  menu: 'menu',
} as const

type Tag = (typeof TAGS)[keyof typeof TAGS]

// Document tags for a headless frontend's page cache (payload-web): a page is tagged with the
// articles and categories it shows, so an edit purges only those pages instead of every page.
export const articleTag = (id: number | string) => `article:${id}`
export const categoryTag = (id: number | string) => `category:${id}`

type Ref = number | { id: number } | null | undefined
const refId = (ref: Ref) => (typeof ref === 'object' ? ref?.id : ref)

// An article appears on its own page and on its category's lists (old and new category).
export const articleDocTags = (doc: { id: number; category?: Ref }, previousDoc?: { category?: Ref }) => {
  const categories = new Set([refId(doc.category), refId(previousDoc?.category)].filter((id) => id != null))
  return [articleTag(doc.id), ...[...categories].map(categoryTag)]
}

// expire: 0 drops the entry immediately; the default profile ('max') would serve the stale
// value once more while refreshing in the background.
// revalidateTag only works inside the Next server (admin, REST, GraphQL). Writes from other
// processes, e.g. `pnpm seed`, cannot reach this process's cache, hence the try/catch.
function expire(tag: Tag, docTags: string[] = []) {
  try {
    revalidateTag(tag, { expire: 0 })
    // CMS_CACHE=page: pages are cached whole (app/(cached)); any content change drops all of them,
    // the same reach as EmDash purging every route tagged with the collection.
    // Implicit page tags include route groups (`_N_T_/(cached)/cached/[locale]/layout`), so
    // '/cached/[locale]' would match nothing; the root layout tag `_N_T_/layout` is on every page.
    if (process.env.CMS_CACHE === 'page') revalidatePath('/', 'layout')
  } catch {}
  notifyFrontend([tag, ...docTags])
}

// Headless frontends (payload-web: Astro + Local API) keep their own cache in another process,
// so they are told over HTTP: REVALIDATE_URL=http://payload-web:3000/api/revalidate.
// The hook runs before the write transaction commits; a reader in the frontend can still load the
// old row right after this call. REVALIDATE_REPEAT_MS sends the same tags again after that delay.
function notifyFrontend(tags: string[]) {
  const url = process.env.REVALIDATE_URL
  if (!url) return
  const send = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': process.env.REVALIDATE_SECRET ?? '' },
      body: JSON.stringify({ tags }),
    }).catch((err) => console.warn(`[revalidate] webhook ${tags}:`, err instanceof Error ? err.message : err))
  void send()
  const repeat = Number(process.env.REVALIDATE_REPEAT_MS)
  if (repeat > 0) setTimeout(send, repeat)
}

export const revalidateCollection =
  (
    tag: Tag,
    docTags?: (doc: any, previousDoc?: any) => string[],
  ): CollectionAfterChangeHook & CollectionAfterDeleteHook =>
  (args) => {
    const { doc } = args
    expire(tag, docTags?.(doc, 'previousDoc' in args ? args.previousDoc : undefined))
    return doc
  }

export const revalidateGlobal =
  (tag: Tag): GlobalAfterChangeHook =>
  ({ doc }) => {
    expire(tag)
    return doc
  }
