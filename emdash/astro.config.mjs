import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, memoryCache as routeMemoryCache } from "astro/config";
import emdash, { local, memoryCache } from "emdash/astro";
import { postgres } from "emdash/db";

// Dev: PG* variables come from .env. In the Docker image there is no .env and
// the container environment provides them.
try {
	process.loadEnvFile(".env");
} catch {}

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	// Content languages: EmDash takes them from Astro's i18n config.
	// URLs are /en/... and /uk/... (same contract as the Payload site).
	i18n: {
		locales: ["en", "uk"],
		defaultLocale: "en",
		routing: {
			prefixDefaultLocale: true,
		},
	},
	// CMS_CACHE=page: Astro route cache, whole responses in process memory. Pages tag themselves
	// with the cache hints of their queries (src/lib/data.ts, cachePage) and EmDash purges those
	// tags on writes. Search and 404 are not cached.
	...(process.env.CMS_CACHE === "page" ? { cache: { provider: routeMemoryCache() } } : {}),
	integrations: [
		react(),
		emdash({
			// No connection string here: emdash bakes this config into the build.
			// node-postgres reads PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE at runtime instead.
			database: postgres({
				pool: { max: Number(process.env.DATABASE_POOL_MAX) || 10 },
			}),
			// CMS_CACHE=data: EmDash's object cache (query results in process memory, dropped on
			// every write through EmDash). Baked into the build like the rest of this config.
			objectCache: process.env.CMS_CACHE === "data" ? memoryCache() : undefined,
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
		}),
	],
	devToolbar: { enabled: false },
});
