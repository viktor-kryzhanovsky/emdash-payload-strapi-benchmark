// Strapi REST client: the site reads content over HTTP (Strapi is headless), unlike Payload's
// Local API and EmDash's query API, which run in the same process as the pages.
const STRAPI_URL = (process.env.STRAPI_URL ?? "http://127.0.0.1:1337").replace(/\/$/, "");

type Query = { [key: string]: string | number | Query | (string | number)[] };

// Strapi's bracket notation (what the `qs` package produces): { filters: { slug: { $eq: "a" } } }
// -> filters[slug][$eq]=a, arrays -> fields[0]=title&fields[1]=slug.
function encode(query: Query, prefix = ""): string[] {
	return Object.entries(query).flatMap(([key, value]) => {
		const name = prefix ? `${prefix}[${key}]` : key;
		if (Array.isArray(value)) return value.map((v, i) => `${name}[${i}]=${encodeURIComponent(v)}`);
		if (typeof value === "object") return encode(value, name);
		return [`${name}=${encodeURIComponent(value)}`];
	});
}

export type StrapiList<T> = {
	data: T[];
	meta: { pagination?: { page: number; pageSize: number; pageCount: number; total: number } };
};

export async function strapi<T>(path: string, query: Query = {}): Promise<T> {
	const res = await fetch(`${STRAPI_URL}/api/${path}?${encode(query).join("&")}`);
	if (!res.ok) throw new Error(`Strapi ${path}: ${res.status} ${await res.text()}`);
	return (await res.json()) as T;
}

// Media is served by Strapi; the site proxies /uploads/* to it (src/pages/uploads/[...path].ts).
export const uploadsUrl = (path: string) => `${STRAPI_URL}${path}`;
