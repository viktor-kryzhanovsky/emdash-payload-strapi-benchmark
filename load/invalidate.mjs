// Cache invalidation latency: change an article title through the CMS HTTP API (like an editor
// in the admin) and poll the pages that show it until the new title appears.
//
//   node load/invalidate.mjs payload [trials]   -> http://localhost:8080
//   node load/invalidate.mjs emdash  [trials]   -> http://localhost:8081
//   node load/invalidate.mjs payload-web [trials] -> writes through Payload (:8080), reads payload-web (:8083)
//
// Article article-01 (en) is the newest one, so it is on the home page, on page 1 of its
// category and on its own page. Each trial sets a unique title; the original is restored at the end.
// Output: per page, ms from the start of the write until the page shows the new title.
const CMS = process.argv[2] ?? "payload";
const TRIALS = Number(process.argv[3] ?? 10);
const SLUG = "article-01";
const LOCALE = "en";
const POLL_MS = 50;
const TIMEOUT_MS = 15_000;

const PAGES = {
	article: `/${LOCALE}/articles/${SLUG}`,
	category: `/${LOCALE}/category/activities`,
	home: `/${LOCALE}`,
};

const adapters = {
	payload: {
		base: "http://localhost:8080",
		user: { email: "bench@example.com", password: "bench-password" },
		async login() {
			const post = (path, body) =>
				fetch(this.base + path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				});
			// payload_bench has no users after seeding: the first one is created through first-register.
			let res = await post("/api/users/login", this.user);
			if (!res.ok) res = await post("/api/users/first-register", this.user);
			if (!res.ok) throw new Error(`payload login: ${res.status} ${await res.text()}`);
			this.auth = { authorization: `JWT ${(await res.json()).token}` };
			const found = await (
				await fetch(`${this.base}/api/articles?where[slug][equals]=${SLUG}&locale=${LOCALE}&depth=0&limit=1`, {
					headers: this.auth,
				})
			).json();
			this.id = found.docs[0].id;
			return found.docs[0].title;
		},
		async setTitle(title) {
			const res = await fetch(`${this.base}/api/articles/${this.id}?locale=${LOCALE}`, {
				method: "PATCH",
				headers: { ...this.auth, "content-type": "application/json" },
				body: JSON.stringify({ title }),
			});
			if (!res.ok) throw new Error(`payload update: ${res.status} ${await res.text()}`);
		},
	},
	emdash: {
		base: "http://localhost:8081",
		// Admin sign-in is passkey-only: create a token with
		//   cd emdash && PGDATABASE=emdash_bench node scripts/bench-token.mjs
		async login() {
			if (!process.env.EMDASH_TOKEN) throw new Error("set EMDASH_TOKEN (emdash/scripts/bench-token.mjs)");
			this.auth = { authorization: `Bearer ${process.env.EMDASH_TOKEN}` };
			const res = await fetch(`${this.base}/_emdash/api/content/articles/${SLUG}?locale=${LOCALE}`, {
				headers: this.auth,
			});
			if (!res.ok) throw new Error(`emdash read: ${res.status} ${await res.text()}`);
			const { item } = (await res.json()).data;
			this.id = item.id;
			return item.data.title;
		},
		async setTitle(title) {
			const res = await fetch(`${this.base}/_emdash/api/content/articles/${this.id}?locale=${LOCALE}`, {
				method: "PUT",
				headers: { ...this.auth, "content-type": "application/json" },
				body: JSON.stringify({ data: { title } }),
			});
			if (!res.ok) throw new Error(`emdash update: ${res.status} ${await res.text()}`);
		},
	},
};

// Payload + Astro: the write goes to the Payload app (admin/REST); the pages are served by payload-web,
// whose cache is invalidated by the hook's webhook.
adapters["payload-web"] = { ...adapters.payload, pageBase: "http://localhost:8083" };

const cms = adapters[CMS];
if (!cms) throw new Error(`unknown CMS ${CMS}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(path, title, t0) {
	for (;;) {
		const elapsed = performance.now() - t0;
		if (elapsed > TIMEOUT_MS) return null;
		const html = await (await fetch((cms.pageBase ?? cms.base) + path)).text();
		if (html.includes(title)) return performance.now() - t0;
		await sleep(POLL_MS);
	}
}

const original = await cms.login();
const results = { write: [], article: [], category: [], home: [] };
try {
	for (let i = 1; i <= TRIALS; i++) {
		const title = `${original} [v${i}-${Math.random().toString(36).slice(2, 7)}]`;
		const t0 = performance.now();
		await cms.setTitle(title);
		results.write.push(performance.now() - t0);
		const seen = await Promise.all(Object.values(PAGES).map((p) => waitFor(p, title, t0)));
		Object.keys(PAGES).forEach((k, j) => results[k].push(seen[j]));
		console.log(
			`trial ${i}: write ${results.write.at(-1).toFixed(0)} ms, visible ` +
				Object.keys(PAGES)
					.map((k, j) => `${k} ${seen[j] === null ? "TIMEOUT" : `${seen[j].toFixed(0)} ms`}`)
					.join(", "),
		);
		await sleep(1000);
	}
} finally {
	await cms.setTitle(original);
}

const stat = (xs) => {
	const ok = xs.filter((x) => x !== null).sort((a, b) => a - b);
	const pick = (q) => ok[Math.min(ok.length - 1, Math.floor(q * ok.length))]?.toFixed(0);
	return `median ${pick(0.5)} ms, max ${ok.at(-1)?.toFixed(0)} ms${ok.length < xs.length ? `, ${xs.length - ok.length} timeouts` : ""}`;
};
console.log(`\n${CMS}: ${TRIALS} trials`);
for (const k of Object.keys(results)) console.log(`  ${k.padEnd(8)} ${stat(results[k])}`);
