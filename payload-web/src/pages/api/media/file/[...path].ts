// Payload serves uploads at /api/media/file/<name> from its Next REST API; without Next, the
// files are read from Payload's media directory here. Not part of the load test (HTML only).
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { APIRoute } from "astro";

const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? "../payload/media");
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export const GET: APIRoute = async ({ params }) => {
	const file = path.resolve(MEDIA_DIR, params.path ?? "");
	if (!file.startsWith(MEDIA_DIR + path.sep)) return new Response(null, { status: 404 });
	try {
		const body = await readFile(file);
		return new Response(body, {
			headers: { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" },
		});
	} catch {
		return new Response(null, { status: 404 });
	}
};
