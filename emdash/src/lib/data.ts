// Data access for the site, mirroring payload/src/lib/data.ts.
// Content queries go through the EmDash query API (in-process, like Payload's Local API).
import type { AstroGlobal } from "astro";
import {
	getEmDashCollection,
	getEmDashEntry,
	getMenuWithCacheHint,
	getTaxonomyTermsWithCacheHint,
	getTerm,
	type CacheHint,
} from "emdash";
import { getDb } from "emdash/runtime";
import type { Kysely } from "kysely";

import type { Locale } from "./i18n";

export const PAGE_SIZE = 6;

export type Paged<T> = { items: T[]; page: number; totalPages: number };

// Cache hints (tags) of every query a page makes. With the route cache enabled (CMS_CACHE=page)
// the page is stored under these tags and EmDash purges them on writes; otherwise unused.
export type Hints = CacheHint[];

// Event-based invalidation only: entries live until a write purges their tags.
const PAGE_MAX_AGE = 365 * 24 * 3600;

// Must run before the page starts streaming (in the page frontmatter), so headers are still writable.
export function cachePage(cache: AstroGlobal["cache"], hints: Hints) {
	if (!cache?.enabled) return;
	cache.set({ maxAge: PAGE_MAX_AGE });
	for (const hint of hints) cache.set(hint);
}

type ImageValue = { src?: string; meta?: Record<string, unknown> } | undefined;

// Local media is stored as { id, meta: { storageKey } }; the file is served by EmDash at
// /_emdash/api/media/file/<storageKey> (same rule as EmDash's buildRenderMediaUrl).
export const mediaUrl = (image: ImageValue) =>
	image?.src ??
	(typeof image?.meta?.storageKey === "string" ? `/_emdash/api/media/file/${image.meta.storageKey}` : undefined);

export async function getMenu(locale: Locale, hints?: Hints) {
	const { data, cacheHint } = await getMenuWithCacheHint("primary", { locale });
	hints?.push(cacheHint);
	return data;
}

export async function getCategories(locale: Locale, hints?: Hints) {
	const { data, cacheHint } = await getTaxonomyTermsWithCacheHint("category", { locale });
	hints?.push(cacheHint);
	return data;
}

// getTerm has no cache-hint variant; a page showing a term depends on the taxonomy tag,
// which is the same for every request, so it is taken once from getTaxonomyTermsWithCacheHint.
let categoryTag: CacheHint | undefined;

// includeCounts: the number of articles in the category, for numbered pagination.
export async function getCategory(locale: Locale, slug: string, hints?: Hints) {
	if (hints) hints.push((categoryTag ??= (await getTaxonomyTermsWithCacheHint("category", { locale })).cacheHint));
	return getTerm("category", slug, { locale, includeCounts: true });
}

const findArticles = async (
	locale: Locale,
	where: Record<string, string | string[]>,
	page: number,
	limit: number,
	hints?: Hints,
) => {
	const { entries, error, cacheHint } = await getEmDashCollection("articles", {
		locale,
		status: "published",
		where,
		orderBy: { date: "desc" },
		limit,
		offset: (page - 1) * limit,
	});
	if (error) throw error;
	hints?.push(cacheHint);
	return entries;
};

export type ArticleEntry = Awaited<ReturnType<typeof findArticles>>[number];

export const listArticles = (locale: Locale, categorySlug: string, page = 1, limit = PAGE_SIZE, hints?: Hints) =>
	findArticles(locale, { category: categorySlug }, page, limit, hints);

// EmDash full-text search is SQLite-only (FTS5), so search is a plain
// `title ILIKE '%q%'` like Payload's `contains`: count + one page of slugs,
// then the entries themselves through the query API. Never cached.
export async function searchArticles(locale: Locale, q: string, page = 1): Promise<Paged<ArticleEntry>> {
	// ec_* tables are created at runtime and are not in EmDash's static Database type.
	const db = (await getDb()) as unknown as Kysely<any>;
	const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
	const matches = db
		.selectFrom("ec_articles")
		.where("locale", "=", locale)
		.where("status", "=", "published")
		.where("deleted_at", "is", null)
		.where("title", "ilike", pattern);

	const [{ count }, rows] = await Promise.all([
		matches.select((eb) => eb.fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
		matches
			.select("slug")
			.orderBy("date", "desc")
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE)
			.execute(),
	]);
	const items = rows.length ? await findArticles(locale, { slug: rows.map((r) => r.slug) }, 1, PAGE_SIZE) : [];
	return { items, page, totalPages: Math.ceil(Number(count) / PAGE_SIZE) };
}

export async function getArticle(locale: Locale, slug: string, hints?: Hints) {
	const { entry, error, cacheHint } = await getEmDashEntry("articles", slug, { locale });
	if (error) throw error;
	hints?.push(cacheHint);
	return entry;
}
