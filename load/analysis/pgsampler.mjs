// Samples pg_stat_activity for one database every 500 ms until killed.
// Output CSV: unix_ms,active_cpu,active_waiting,idle,idle_in_tx,top_wait
// active_cpu = state active and no wait event (running on CPU or queued for it).
import { createRequire } from "node:module";
const require = createRequire(new URL("../../emdash/package.json", import.meta.url));
const { Client } = require("pg");

const db = process.argv[2] ?? "emdash_bench";
const c = new Client({ host: "127.0.0.1", user: "payload", password: "payload", database: "postgres" });
await c.connect();
console.log("unix_ms,active_cpu,active_waiting,idle,idle_in_tx,top_wait");
setInterval(async () => {
	const { rows } = await c.query(
		`SELECT state, wait_event_type, wait_event FROM pg_stat_activity
		 WHERE datname = $1 AND pid <> pg_backend_pid() AND backend_type = 'client backend'`,
		[db],
	);
	let cpu = 0, waiting = 0, idle = 0, tx = 0;
	const waits = {};
	for (const r of rows) {
		if (r.state === "active") {
			if (r.wait_event_type) {
				waiting++;
				const k = `${r.wait_event_type}:${r.wait_event}`;
				waits[k] = (waits[k] ?? 0) + 1;
			} else cpu++;
		} else if (r.state === "idle") idle++;
		else if (r.state?.startsWith("idle in transaction")) tx++;
	}
	const top = Object.entries(waits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
	console.log([Date.now(), cpu, waiting, idle, tx, top].join(","));
}, 500);
