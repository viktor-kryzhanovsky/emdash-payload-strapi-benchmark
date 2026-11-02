// Cache invalidation webhook: Payload's collection hooks run in the Next process (admin, REST)
// and POST { tags } here (payload/src/lib/revalidate.ts, REVALIDATE_URL).
import type { APIRoute } from "astro";
import { revalidateTag } from "next/cache";

export const POST: APIRoute = async ({ request }) => {
	if (!process.env.REVALIDATE_SECRET || request.headers.get("x-revalidate-secret") !== process.env.REVALIDATE_SECRET) {
		return new Response(null, { status: 401 });
	}
	const { tags } = (await request.json()) as { tags?: string[] };
	for (const tag of tags ?? []) revalidateTag(tag);
	return Response.json({ revalidated: tags ?? [] });
};
