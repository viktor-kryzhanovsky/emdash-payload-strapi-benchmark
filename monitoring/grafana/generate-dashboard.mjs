// Generates the Grafana dashboard (monitoring/grafana/dashboards/cms-bench.json):
//   node monitoring/grafana/generate-dashboard.mjs monitoring/grafana/dashboards/cms-bench.json
import { writeFileSync } from 'node:fs';
const ds = { type: 'prometheus', uid: 'prometheus' };
let id = 0, y = 0;
const panels = [];
const row = (title) => { panels.push({ id: ++id, type: 'row', title, collapsed: false, gridPos: { h: 1, w: 24, x: 0, y }, panels: [] }); y += 1; };
const ts = (title, targets, { unit = 'short', w = 12, x = 0, min = 0, desc, max, stack } = {}) => {
  panels.push({
    id: ++id, type: 'timeseries', title, description: desc, datasource: ds,
    gridPos: { h: 8, w, x, y },
    fieldConfig: { defaults: { unit, min, max, custom: { lineWidth: 2, fillOpacity: 8, showPoints: 'never', ...(stack ? { stacking: { mode: 'normal' } } : {}) } }, overrides: [] },
    options: { legend: { displayMode: 'table', placement: 'right', calcs: ['mean', 'max', 'lastNotNull'] }, tooltip: { mode: 'multi', sort: 'desc' } },
    targets: targets.map(([expr, legendFormat], i) => ({ refId: String.fromCharCode(65 + i), datasource: ds, expr, legendFormat })),
  });
  if (x + w >= 24) y += 8;
};
const T = '{testid=~"$testid"}';
const TP = (extra) => `{testid=~"$testid",${extra}}`;

row('Load (k6)');
ts('Requests per second by page', [[`sum by (page) (rate(k6_http_reqs_total${T}[$__rate_interval]))`, '{{page}}']], { unit: 'reqps', stack: true });
ts('Latency p50 / p95 / p99', [
  [`max(k6_http_req_duration_p50${T})`, 'p50'],
  [`max(k6_http_req_duration_p95${T})`, 'p95'],
  [`max(k6_http_req_duration_p99${T})`, 'p99'],
], { unit: 's', x: 12, desc: 'Highest value across pages. Target for phase 1: p95 < 300 ms, p99 < 1 s.' });
ts('p95 latency by page', [[`max by (page) (k6_http_req_duration_p95${T})`, '{{page}}']], { unit: 's', w: 8 });
ts('Error rate', [[`sum(rate(k6_http_reqs_total${TP('expected_response="false"')}[$__rate_interval])) / sum(rate(k6_http_reqs_total${T}[$__rate_interval]))`, 'errors']], { unit: 'percentunit', w: 8, x: 8, desc: 'Non-2xx/3xx responses and network errors. Target < 1 %.' });
ts('Virtual users and dropped iterations', [
  [`sum(k6_vus${T})`, 'VUs'],
  [`sum(rate(k6_dropped_iterations_total${T}[$__rate_interval]))`, 'dropped/s'],
], { w: 8, x: 16, desc: 'Dropped iterations: k6 could not start a request on schedule, the system is saturated.' });

row('Containers');
ts('CPU (cores)', [[`rate(container_cpu_usage_seconds_total[$__rate_interval])`, '{{name}}']], { desc: 'CMS under test is limited to 1 core (strapi + strapi-cms share it), postgres to 1.' });
ts('Memory (working set)', [[`container_memory_working_set_bytes`, '{{name}}']], { unit: 'bytes', x: 12, desc: 'CMS limit 2 GiB, postgres 1 GiB.' });
ts('Network', [
  [`rate(container_network_transmit_bytes_total{name=~"payload|emdash|strapi.*"}[$__rate_interval])`, '{{name}} sent'],
  [`rate(container_network_receive_bytes_total{name=~"payload|emdash|strapi.*"}[$__rate_interval])`, '{{name}} received'],
], { unit: 'Bps', w: 24 });

row('Postgres');
ts('Connections', [[`sum by (datname, state) (pg_stat_activity_count{datname=~"(payload|emdash|strapi).*"})`, '{{datname}} {{state}}']], { w: 8 });
ts('Transactions per second', [[`rate(pg_stat_database_xact_commit{datname=~"(payload|emdash|strapi).*"}[$__rate_interval])`, '{{datname}}']], { unit: 'ops', w: 8, x: 8 });
ts('Rows read per second', [
  [`rate(pg_stat_database_tup_returned{datname=~"(payload|emdash|strapi).*"}[$__rate_interval])`, '{{datname}} returned'],
  [`rate(pg_stat_database_tup_fetched{datname=~"(payload|emdash|strapi).*"}[$__rate_interval])`, '{{datname}} fetched'],
], { w: 8, x: 16, desc: 'returned: rows scanned; fetched: rows fetched by index. returned >> fetched means sequential scans.' });
ts('Buffer cache hit ratio', [[`rate(pg_stat_database_blks_hit{datname=~"(payload|emdash|strapi).*"}[$__rate_interval]) / (rate(pg_stat_database_blks_hit{datname=~"(payload|emdash|strapi).*"}[$__rate_interval]) + rate(pg_stat_database_blks_read{datname=~"(payload|emdash|strapi).*"}[$__rate_interval]))`, '{{datname}}']], { unit: 'percentunit', w: 24, max: 1 });

const dashboard = {
  uid: 'cms-bench', title: 'CMS bench', tags: ['bench'], timezone: 'browser', schemaVersion: 39, version: 1,
  refresh: '5s', time: { from: 'now-30m', to: 'now' },
  templating: { list: [{
    name: 'testid', label: 'Test run', type: 'query', datasource: ds,
    query: { query: 'label_values(k6_http_reqs_total, testid)', refId: 'testid' },
    refresh: 2, includeAll: true, allValue: '.*', multi: false, current: { text: 'All', value: '$__all' }, sort: 2,
  }] },
  panels,
};
writeFileSync(process.argv[2], JSON.stringify(dashboard, null, 2) + '\n');
console.log(panels.length, 'panels');
