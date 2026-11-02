import node from "@astrojs/node";
import { defineConfig } from "astro/config";

// Frontend for Strapi: same pages, markup and CSS as the EmDash site (Astro), data over Strapi's REST API.
// STRAPI_URL is read at runtime (src/lib/strapi.ts).
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
	devToolbar: { enabled: false },
});
