import { fileURLToPath } from "node:url";

import node from "@astrojs/node";
import { defineConfig, memoryCache } from "astro/config";

// Astro frontend for Payload: the pages call the Payload Local API in this process, through the very
// same payload/src/lib/data.ts as the Next site (no HTTP, no Next/React rendering). The Payload admin
// stays in the Next app and is not part of the benchmark.
const payloadSrc = fileURLToPath(new URL("../payload/src", import.meta.url));

// Dev: DATABASE_URL and PAYLOAD_SECRET from the Payload project; Docker sets them in the environment.
try {
	process.loadEnvFile(fileURLToPath(new URL("../payload/.env", import.meta.url)));
} catch {}

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	i18n: {
		locales: ["en", "uk"],
		defaultLocale: "en",
		routing: {
			prefixDefaultLocale: true,
		},
	},
	// CMS_CACHE=page (build time): Astro route cache, see src/lib/cache.ts.
	...(process.env.CMS_CACHE === "page" ? { cache: { provider: memoryCache() } } : {}),
	devToolbar: { enabled: false },
	vite: {
		resolve: {
			alias: [
				{ find: "@payload-config", replacement: `${payloadSrc}/payload.config.ts` },
				{ find: /^@\//, replacement: `${payloadSrc}/` },
				{ find: "next/cache", replacement: fileURLToPath(new URL("./src/stubs/next-cache.ts", import.meta.url)) },
			],
		},
		ssr: {
			// Payload and its database driver run from node_modules as they are, not bundled.
			external: ["payload", "@payloadcms/db-postgres", "@payloadcms/richtext-lexical", "sharp", "graphql"],
		},
	},
});
