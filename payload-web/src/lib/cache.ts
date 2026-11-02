// Page cache (CMS_CACHE=page): Astro's route cache keeps whole responses in process memory.
// Payload's hooks POST tags to /api/revalidate, which purges them here. Search and 404 are not cached.
//
// Pages are tagged with the documents they show (article:<id>, category:<id>), so editing an article
// purges its page, its category's pages and the home page only. Tagging every page with the
// collection ("articles") would empty the whole cache on each edit: under load every request then
// misses at once and re-renders (thundering herd).
import { TAGS } from "@/lib/revalidate";
import type { AstroGlobal } from "astro";

export { articleTag, categoryTag } from "@/lib/revalidate";

// Event-based invalidation only: entries live until a webhook purges their tags.
const PAGE_MAX_AGE = 365 * 24 * 3600;

// Shared by every page: the menu, category titles and covers. Rare, coarse purges.
const COMMON_TAGS = [TAGS.menu, TAGS.categories, TAGS.media];

// Must run in the page frontmatter, before the response starts streaming.
export function cachePage(cache: AstroGlobal["cache"], tags: string[]) {
	if (cache?.enabled) cache.set({ maxAge: PAGE_MAX_AGE, tags: [...COMMON_TAGS, ...tags] });
}
