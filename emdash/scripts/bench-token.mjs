// Benchmark-only: an admin user and an API token for scripted writes (load/invalidate.mjs).
// The admin UI signs in with passkeys, which a script cannot do, so the token is created
// directly in the database, hashed the same way EmDash does (@emdash-cms/auth).
//
//   PGDATABASE=emdash_bench node scripts/bench-token.mjs   -> prints ec_pat_...
// Re-running replaces the previous "bench" token.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ulid } from "emdash";
import { createDialect } from "emdash/db/postgres";
import { Kysely } from "kysely";

try {
	process.loadEnvFile(".env");
} catch {}

// @emdash-cms/auth is a dependency of emdash, not of this project.
const fromEmdash = createRequire(import.meta.resolve("emdash"));
const { generatePrefixedToken } = await import(pathToFileURL(fromEmdash.resolve("@emdash-cms/auth")).href);

const EMAIL = "bench@example.com";
const ADMIN_ROLE = 50;
const db = new Kysely({ dialect: createDialect({}) });

try {
	let user = await db.selectFrom("users").select("id").where("email", "=", EMAIL).executeTakeFirst();
	if (!user) {
		user = { id: ulid() };
		await db
			.insertInto("users")
			.values({ id: user.id, email: EMAIL, name: "Bench", role: ADMIN_ROLE, email_verified: 1 })
			.execute();
	}
	await db.deleteFrom("_emdash_api_tokens").where("user_id", "=", user.id).where("name", "=", "bench").execute();
	const { raw, hash, prefix } = generatePrefixedToken("ec_pat_");
	await db
		.insertInto("_emdash_api_tokens")
		.values({
			id: ulid(),
			name: "bench",
			token_hash: hash,
			prefix,
			user_id: user.id,
			scopes: JSON.stringify(["content:read", "content:write"]),
		})
		.execute();
	console.log(raw);
} finally {
	await db.destroy();
}
