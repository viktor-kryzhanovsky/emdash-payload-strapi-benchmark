// Per-plateau metrics of a steps run (2-minute plateaus after 30 s ramps), from Prometheus.
//   CMS=emdash node load/analysis/plateaus.mjs <testid> <run start, unix s> 40 80 120 ...
// The start is results/<testid>.json finishedAt minus durationS. For Strapi pass CMS=strapi-cms.
const [testid, startS, ...rates] = process.argv.slice(2);
const CMS = process.env.CMS || 'payload';
const P = 'http://localhost:9090/api/v1/query';
const q = async (query, time) => {
  const r = await (await fetch(`${P}?query=${encodeURIComponent(query)}&time=${time}`)).json();
  return r.data.result.map((x) => [x.metric.name ?? '', +x.value[1]]);
};
const T = `testid="${testid}"`;
let t0 = +startS;
console.log('rate | rps | p50 | p95 | p99 ms | cpu cms | cpu pg | mem MB | dropped/s');
for (const rate of rates) {
  const end = t0 + 150, w = '115s', at = end - 3;
  const rps = (await q(`sum(rate(k6_http_reqs_total{${T}}[${w}]))`, at))[0]?.[1];
  const lat = async (s) => (await q(`avg_over_time(max(k6_http_req_duration_${s}{${T}})[${w}:5s])*1000`, at))[0]?.[1];
  const cpu = Object.fromEntries(await q(`rate(container_cpu_usage_seconds_total{name=~"${CMS}|postgres"}[${w}])`, at));
  const mem = (await q(`max_over_time(container_memory_working_set_bytes{name="${CMS}"}[${w}])/2^20`, at))[0]?.[1];
  const drop = (await q(`sum(rate(k6_dropped_iterations_total{${T}}[${w}]))`, at))[0]?.[1] ?? 0;
  console.log([rate, rps?.toFixed(1), (await lat('p50'))?.toFixed(0), (await lat('p95'))?.toFixed(0), (await lat('p99'))?.toFixed(0), cpu[CMS]?.toFixed(2), cpu.postgres?.toFixed(2), mem?.toFixed(0), drop.toFixed(2)].join(' | '));
  t0 = end;
}
