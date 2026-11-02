// Read-only load test for the CMS frontend (same URL contract for every CMS).
// Run through ./load/run.sh <profile>, which sets the env below.
//
//   PROFILE  smoke | steps | breakpoint | soak       (default smoke)
//   TARGET   base URL as seen from the k6 container  (default http://payload:3000)
//   CMS      label for results and Grafana           (default payload)
//   RATE     soak: requests/s; STEPS: steps: comma-separated requests/s
//   PREFIX   path prefix, e.g. /bench-data (Payload: same data calls as JSON, no rendering)
import http from 'k6/http';
import { check } from 'k6';

const data = JSON.parse(open('/data/articles.json'));

const PROFILE = __ENV.PROFILE || 'smoke';
const TARGET = (__ENV.TARGET || 'http://payload:3000').replace(/\/$/, '');
const CMS = __ENV.CMS || 'payload';
const PREFIX = __ENV.PREFIX || '';
const TESTID = __ENV.TESTID || `${CMS}-${PROFILE}`;

// Traffic mix, % of iterations (one iteration = one page view).
// Override with MIX=article:50,category:30,home:20 (e.g. without search, to measure only cached pages).
const MIX = __ENV.MIX
  ? __ENV.MIX.split(',').map((p) => {
      const [page, w] = p.split(':');
      return [page, Number(w)];
    })
  : [
      ['article', 45],
      ['category', 25],
      ['home', 20],
      ['search', 10],
    ];

// --- load profiles (open model: k6 keeps the arrival rate even when the server slows down) ---

const arrival = (stages, extra = {}) => ({
  executor: 'ramping-arrival-rate',
  startRate: stages[0].target,
  timeUnit: '1s',
  preAllocatedVUs: 50,
  maxVUs: 400,
  stages,
  ...extra,
});

function stepStages() {
  const steps = (__ENV.STEPS || '10,20,40,60,80').split(',').map(Number);
  // 30 s ramp + 2 min plateau per step: the plateaus are what we read off the graphs.
  return steps.flatMap((target) => [
    { duration: '30s', target },
    { duration: '2m', target },
  ]);
}

const PROFILES = {
  smoke: { executor: 'constant-vus', vus: 1, duration: '30s' },
  steps: arrival(stepStages()),
  // Linear ramp until the SLO breaks (thresholds abort the run).
  breakpoint: arrival([{ duration: '10m', target: Number(__ENV.MAX_RATE || 300) }], { startRate: 5 }),
  soak: arrival([
    { duration: '1m', target: Number(__ENV.RATE || 40) },
    { duration: __ENV.DURATION || '30m', target: Number(__ENV.RATE || 40) },
  ]),
};

// --- SLO ---

const SLO = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<500', 'p(99)<1500'],
};
const thresholds = { ...SLO };
// Per-page sub-metrics: they show up in the summary and results/*.json.
for (const [page] of MIX) {
  thresholds[`http_req_duration{page:${page}}`] = ['p(95)<500'];
}
if (PROFILE === 'breakpoint') {
  const abort = (t) => ({ threshold: t, abortOnFail: true, delayAbortEval: '30s' });
  thresholds.http_req_failed = [abort('rate<0.01')];
  thresholds.http_req_duration = [abort('p(95)<500')];
}

export const options = {
  scenarios: { [PROFILE]: PROFILES[PROFILE] },
  thresholds,
  tags: { testid: TESTID, cms: CMS },
  // No `url` tag: one time series per page type instead of one per URL.
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response', 'error_code'],
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: false,
};

// --- URL generators ---

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const locale = () => pick(data.locales);

const pagesPerCategory = Object.fromEntries(
  data.categories.map((c) => [
    c.slug,
    Math.ceil(data.articles.filter((a) => a.category === c.key).length / data.pageSize),
  ]),
);

const urls = {
  home: () => `/${locale()}`,
  category: () => {
    const c = pick(data.categories);
    const page = 1 + Math.floor(Math.random() * pagesPerCategory[c.slug]);
    return `/${locale()}/category/${c.slug}${page > 1 ? `?page=${page}` : ''}`;
  },
  article: () => `/${locale()}/articles/${pick(data.articles).slug}`,
  search: () => {
    const l = locale();
    return `/${l}/search?q=${encodeURIComponent(pick(data.searchTerms[l]))}`;
  },
};

const total = MIX.reduce((s, [, w]) => s + w, 0);
function pickPage() {
  let r = Math.random() * total;
  for (const [page, w] of MIX) if ((r -= w) < 0) return page;
  return MIX[0][0];
}

export default function () {
  const page = pickPage();
  const res = http.get(TARGET + PREFIX + urls[page](), { tags: { page, name: page }, redirects: 0 });
  check(res, {
    'status 200': (r) => r.status === 200,
    'full body': (r) => r.body && r.body.includes(PREFIX ? '"data"' : '</html>'),
  }, { page });
}

// --- results: results/<testid>.json + console summary ---

export function handleSummary(summary) {
  const m = summary.metrics;
  const ms = (metric, stat) => (m[metric] ? Math.round(m[metric].values[stat]) : null);
  const row = (metric) => ({
    p50: ms(metric, 'med'),
    p95: ms(metric, 'p(95)'),
    p99: ms(metric, 'p(99)'),
    max: ms(metric, 'max'),
  });
  const result = {
    testid: TESTID,
    cms: CMS,
    profile: PROFILE,
    target: TARGET + PREFIX,
    finishedAt: new Date().toISOString(),
    durationS: Math.round(summary.state.testRunDurationMs / 1000),
    requests: m.http_reqs.values.count,
    rps: Math.round(m.http_reqs.values.rate * 10) / 10,
    errorRate: m.http_req_failed.values.rate,
    droppedIterations: m.dropped_iterations ? m.dropped_iterations.values.count : 0,
    maxVUs: m.vus_max ? m.vus_max.values.max : null,
    latencyMs: {
      all: row('http_req_duration'),
      ...Object.fromEntries(MIX.map(([p]) => [p, row(`http_req_duration{page:${p}}`)])),
    },
    thresholdsPassed: Object.values(m).every((x) => !x.thresholds || Object.values(x.thresholds).every((t) => t.ok)),
  };

  const line = (name, r) =>
    `  ${name.padEnd(9)} p50 ${String(r.p50).padStart(5)}  p95 ${String(r.p95).padStart(5)}  p99 ${String(r.p99).padStart(5)}  max ${String(r.max).padStart(6)} ms`;
  const text = [
    '',
    `${TESTID}: ${result.requests} req in ${result.durationS}s, ${result.rps} req/s, ` +
      `errors ${(result.errorRate * 100).toFixed(2)}%, dropped ${result.droppedIterations}, ` +
      `SLO ${result.thresholdsPassed ? 'PASS' : 'FAIL'}`,
    ...Object.entries(result.latencyMs).map(([k, v]) => line(k, v)),
    '',
  ].join('\n');

  return {
    stdout: text,
    [`/results/${TESTID}.json`]: JSON.stringify(result, null, 2),
  };
}
