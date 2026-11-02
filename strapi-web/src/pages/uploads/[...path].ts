// Media lives in Strapi (public/uploads); the site serves it from its own origin like the
// Payload and EmDash sites do. Not part of the load test (k6 requests HTML only).
import type { APIRoute } from "astro";

import { uploadsUrl } from "../../lib/strapi";

export const GET: APIRoute = async ({ params }) => {
	const res = await fetch(uploadsUrl(`/uploads/${params.path}`));
	return new Response(res.body, {
		status: res.status,
		headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
	});
};
