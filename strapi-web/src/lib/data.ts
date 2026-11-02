// Data access for the site, mirroring payload/src/lib/data.ts and emdash/src/lib/data.ts.
// Every call is one HTTP request to Strapi; fields and relations are trimmed to what the pages render.
import type { Locale } from "./i18n";
import { strapi, type StrapiList } from "./strapi";

export const PAGE_SIZE = 6;

export type Paged<T> = { items: T[]; page: number; totalPages: number };

export type Menu = { items: { id: number; label: string; url: string }[] };
export type Category = { title: string; slug: string };
export type Media = { url: string; alternativeText: string | null; width: number | null; height: number | null };
export type Block = { type: string; level?: number; format?: string; children?: Block[]; text?: string; url?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; code?: boolean };
export type Article = {
	slug: string;
	title: string;
	excerpt: string | null;
	date: string;
	readingTime: number | null;
	cover: Media | null;
	category: Category | null;
	body?: Block[];
};

const cardFields = ["title", "slug", "excerpt", "date", "readingTime"];
const populate = {
	cover: { fields: ["url", "alternativeText", "width", "height"] },
	category: { fields: ["title", "slug"] },
};

export async function getMenu(locale: Locale) {
	const res = await strapi<{ data: Menu | null }>("menu", { locale, populate: { items: { fields: ["label", "url"] } } });
	return res.data;
}

export async function getCategories(locale: Locale) {
	const res = await strapi<StrapiList<Category>>("categories", {
		locale,
		fields: ["title", "slug"],
		sort: "id",
		pagination: { pageSize: 100 },
	});
	return res.data;
}

export async function getCategory(locale: Locale, slug: string) {
	const res = await strapi<StrapiList<Category>>("categories", {
		locale,
		fields: ["title", "slug"],
		filters: { slug: { $eq: slug } },
		pagination: { pageSize: 1, withCount: "false" },
	});
	return res.data[0] ?? null;
}

async function findArticles(
	locale: Locale,
	filters: Record<string, unknown>,
	page: number,
	pageSize: number,
): Promise<Paged<Article>> {
	const res = await strapi<StrapiList<Article>>("articles", {
		locale,
		fields: cardFields,
		populate,
		filters: filters as never,
		sort: "date:desc",
		pagination: { page, pageSize },
	});
	return { items: res.data, page, totalPages: res.meta.pagination?.pageCount ?? 1 };
}

export const listArticles = (locale: Locale, categorySlug: string, page = 1, pageSize = PAGE_SIZE) =>
	findArticles(locale, { category: { slug: { $eq: categorySlug } } }, page, pageSize);

// $containsi = ILIKE '%q%', the same as Payload's `contains` and the EmDash site's search.
export const searchArticles = (locale: Locale, q: string, page = 1) =>
	findArticles(locale, { title: { $containsi: q } }, page, PAGE_SIZE);

export async function getArticle(locale: Locale, slug: string) {
	const res = await strapi<StrapiList<Article>>("articles", {
		locale,
		fields: [...cardFields, "author", "body"],
		populate,
		filters: { slug: { $eq: slug } },
		pagination: { pageSize: 1, withCount: "false" },
	});
	return (res.data[0] as (Article & { author: string | null }) | undefined) ?? null;
}
