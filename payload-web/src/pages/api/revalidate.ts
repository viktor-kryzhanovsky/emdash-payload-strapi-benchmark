// Cache invalidation webhook: Payload's collection hooks run in the Next process (admin, REST)
// and POST { tags } here (payload/src/lib/revalidate.ts, REVALIDATE_URL). Purges the data cache
// (CMS_CACHE=data) and the route cache (CMS_CACHE=page).
import type { APIRoute } from "astro";
import { revalidateTag } from "next/cache";

export const POST: APIRoute = async ({ request, cache }) => {
	if (!process.env.REVALIDATE_SECRET || request.headers.get("x-revalidate-secret") !== process.env.REVALIDATE_SECRET) {
		return new Response(null, { status: 401 });
	}
	const { tags } = (await request.json()) as { tags?: string[] };
	for (const tag of tags ?? []) revalidateTag(tag);
	if (cache?.enabled && tags?.length) await cache.invalidate({ tags });
	return Response.json({ revalidated: tags ?? [] });
};
