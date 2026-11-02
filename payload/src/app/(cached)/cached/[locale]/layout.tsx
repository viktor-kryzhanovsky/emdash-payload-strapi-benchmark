// Page cache (CMS_CACHE=page): the same layout and pages as (frontend), but statically rendered
// on first request and kept in Next's full route cache until a collection hook revalidates them
// (src/lib/revalidate.ts). next.config rewrites /en/... here only in that mode.
// Route segment config must be literal in each file, hence these thin re-exports.
export { default, metadata } from '../../../(frontend)/[locale]/layout'

export const dynamic = 'force-static'
export const revalidate = false
