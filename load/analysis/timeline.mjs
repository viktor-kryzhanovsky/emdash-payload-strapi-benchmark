// 30-second timeline of a breakpoint run: RPS, p95, CPU of the CMS and Postgres, and the
// pg_stat_activity samples recorded by experiment.sh.
//   node load/analysis/timeline.mjs <testid> <dir with activity.csv>
import fs from "node:fs";
const [testid, dir] = process.argv.slice(2);
const r = JSON.parse(fs.readFileSync(`results/${testid}.json`));
const end = Math.floor(new Date(r.finishedAt) / 1000), start = end - r.durationS;
const P = "http://localhost:9090/api/v1/query_range";
const range = async (q) => {
  const u = `${P}?query=${encodeURIComponent(q)}&start=${start}&end=${end}&step=30`;
  const j = await (await fetch(u)).json();
  return Object.fromEntries(j.data.result.map((x) => [x.metric.name ?? "", x.values.map(([t, v]) => [t, +v])]));
};
const T = `testid="${testid}"`;
const rps = (await range(`sum(rate(k6_http_reqs_total{${T}}[30s]))`))[""];
const p95 = (await range(`max(k6_http_req_duration_p95{${T}})*1000`))[""];
const cpu = await range(`rate(container_cpu_usage_seconds_total{name=~"emdash|postgres"}[30s])`);
const act = fs.readFileSync(`${dir}/activity.csv`, "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
console.log("t(s)  rps   p95ms  cpuCMS cpuPG | pg conns: on-cpu  waiting  idle | top wait");
for (const [t, v] of rps) {
  const at = (s) => s?.find(([x]) => x === t)?.[1];
  const win = act.filter(([ms]) => ms / 1000 > t - 30 && ms / 1000 <= t);
  const avg = (i) => (win.reduce((s, a) => s + +a[i], 0) / (win.length || 1)).toFixed(1);
  const waits = {};
  for (const a of win) if (a[5]) waits[a[5]] = (waits[a[5]] ?? 0) + 1;
  const top = Object.entries(waits).sort((a, b) => b[1] - a[1])[0];
  console.log(String(t - start).padStart(4), v.toFixed(0).padStart(5), (at(p95) ?? 0).toFixed(0).padStart(7), (at(cpu.emdash) ?? 0).toFixed(2).padStart(7), (at(cpu.postgres) ?? 0).toFixed(2).padStart(6), "|", avg(1).padStart(8), avg(2).padStart(8), avg(3).padStart(5), "|", top ? `${top[0]} (${top[1]}/${win.length})` : "");
}
