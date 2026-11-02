// Benchmark-only: the same data calls as the page at the same URL, returned as JSON
// without rendering. /bench-data/en/category/education?page=2 mirrors /en/category/education?page=2.
// Comparing CPU per request with the real pages splits the cost into data vs rendering.
// Same contract as payload/src/app/bench-data/[...path]/route.ts and emdash/src/pages/bench-data.
import type { APIRoute } from "astro";

import { getArticle, getCategories, getCategory, getMenu, listArticles, searchArticles } from "../../lib/data";
import { isLocale, parsePage } from "../../lib/i18n";

export const GET: APIRoute = async ({ params, url }) => {
	const [locale, section, slug] = (params.path ?? "").split("/");
	if (!isLocale(locale)) return Response.json(null, { status: 404 });

	// the layout loads the menu on every page
	const menu = await getMenu(locale);
	let data: unknown;

	if (!section) {
		const categories = await getCategories(locale);
		data = await Promise.all(
			categories.map(async (category) => ({
				category,
				articles: (await listArticles(locale, category.slug, 1, 3)).items,
			})),
		);
	} else if (section === "category" && slug) {
		const category = await getCategory(locale, slug);
		data = category && { category, ...(await listArticles(locale, slug, parsePage(url.searchParams.get("page")))) };
	} else if (section === "articles" && slug) {
		data = await getArticle(locale, slug);
	} else if (section === "search") {
		const q = url.searchParams.get("q")?.trim();
		data = q ? await searchArticles(locale, q, parsePage(url.searchParams.get("page"))) : null;
	}

	if (!data) return Response.json(null, { status: 404 });
	return Response.json({ menu, data });
};
