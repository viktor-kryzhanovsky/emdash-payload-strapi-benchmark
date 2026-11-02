// Loads ../data/articles.json (the same dataset as the Payload site) into EmDash.
// Re-runnable: entries are matched by (slug, locale) and updated.
//
//   pnpm seed                         -> database from .env (PGDATABASE=emdash)
//   PGDATABASE=emdash_bench pnpm seed -> benchmark database
//
// The setup wizard applies only the schema from seed/seed.json; taxonomy terms and
// content count as "sample content", and `emdash seed` supports SQLite only,
// so this script calls applySeed with includeContent itself.
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeContentHash, MediaRepository, ulid } from "emdash";
import { createDialect } from "emdash/db/postgres";
import { applySeed } from "emdash/seed";
import { createStorage } from "emdash/storage/local";
import { Kysely } from "kysely";

try {
	process.loadEnvFile(".env");
} catch {}

const DATA_FILE = process.env.SEED_FILE || path.resolve("../data/articles.json");
const data = JSON.parse(readFileSync(DATA_FILE, "utf8"));
const schema = JSON.parse(readFileSync("seed/seed.json", "utf8"));
const [first] = data.locales;

const db = new Kysely({ dialect: createDialect({}) });
const storage = createStorage({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" });

// --- covers: stored directly ($media in seeds only downloads from public URLs) ---

// Width/height from the JPEG SOF marker.
function jpegSize(buf) {
	for (let i = 2; i < buf.length; ) {
		const marker = buf[i + 1];
		if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
		i += 2 + buf.readUInt16BE(i + 2);
	}
	return {};
}

const media = new MediaRepository(db);
const covers = {};
for (const c of data.covers) {
	const body = readFileSync(path.resolve(path.dirname(DATA_FILE), c.file));
	const filename = path.basename(c.file);
	const contentHash = await computeContentHash(new Uint8Array(body));
	let item = await media.findByContentHash(contentHash);
	if (!item) {
		const storageKey = `${ulid()}.jpg`;
		await storage.upload({ key: storageKey, body: new Uint8Array(body), contentType: "image/jpeg" });
		item = await media.create({
			filename,
			mimeType: "image/jpeg",
			size: body.length,
			...jpegSize(body),
			alt: c.alt,
			storageKey,
			contentHash,
			status: "ready",
		});
	}
	covers[c.file] = {
		provider: "local",
		id: item.id,
		alt: item.alt ?? c.alt,
		width: item.width,
		height: item.height,
		mimeType: item.mimeType,
		filename: item.filename,
		meta: { storageKey: item.storageKey },
	};
}

// --- taxonomy terms: the same category definitions as seed/seed.json, plus terms from the dataset ---

const taxonomies = data.locales.map((locale) => ({
	...schema.taxonomies.find((t) => t.locale === locale),
	terms: data.categories.map((c) => ({
		id: `term:${c.slug}:${locale}`,
		slug: c.slug,
		label: c.title[locale],
		locale,
		...(locale === first ? {} : { translationOf: `term:${c.slug}:${first}` }),
	})),
}));

// --- articles ---

const portableText = (paragraphs, slug) =>
	paragraphs.map((text, i) => ({
		_type: "block",
		_key: `${slug}-p${i}`,
		style: "normal",
		markDefs: [],
		children: [{ _type: "span", _key: `${slug}-s${i}`, text, marks: [] }],
	}));

// Same rule as the Payload readingTime hook: words / 200, rounded up, at least 1.
const readingTime = (paragraphs) =>
	Math.max(1, Math.ceil(paragraphs.join(" ").split(/\s+/).filter(Boolean).length / 200));

const articles = data.articles.flatMap((a) =>
	data.locales.map((locale) => {
		const l = a.locales[locale];
		return {
			id: `article:${a.slug}:${locale}`,
			slug: a.slug,
			locale,
			...(locale === first ? {} : { translationOf: `article:${a.slug}:${first}` }),
			status: "published",
			data: {
				title: l.title,
				excerpt: l.excerpt,
				body: portableText(l.body, a.slug),
				reading_time: readingTime(l.body),
				author: a.author,
				date: a.publishedAt,
				cover: covers[a.cover],
			},
			taxonomies: { category: [a.category] },
		};
	}),
);

try {
	const result = await applySeed(
		db,
		{ ...schema, taxonomies, content: { articles } },
		{ includeContent: true, onConflict: "update" },
	);
	const { count } = await db
		.selectFrom("ec_articles")
		.select((eb) => eb.fn.countAll().as("count"))
		.where("deleted_at", "is", null)
		.executeTakeFirstOrThrow();
	console.log(
		`seeded ${data.articles.length} articles x ${data.locales.length} locales ` +
			`(created ${result.content.created}, updated ${result.content.updated}; ${count} rows in ec_articles), ` +
			`${Object.keys(covers).length} covers, ${result.taxonomies.terms} terms`,
	);
} finally {
	await db.destroy();
}
