# CMS bench: Payload, EmDash, Strapi

Read-only load on the full chain frontend → CMS → Postgres, i18n en/uk, 20 articles × 2 locales.
All sites render the same pages (same URLs, markup and CSS) from the same dataset.

## Setup

| | Payload | EmDash | Strapi |
|---|---|---|---|
| Version | Payload 3.92.1, Next 16.3.3 | EmDash 1.4.0, Astro 7.4.4 | Strapi 5.60.0 + Astro 7.4.4 frontend |
| Data access | Local API (in-process) | EmDash query API (in-process) | REST over HTTP (headless), 2–4 calls per page |
| Process | single Node 24.22.1 process (`node server.js`) | single Node 24.22.1 process (`node dist/server/entry.mjs`) | two processes: Strapi + Astro |
| Budget | 1 vCPU / 2 GB (core 0) | 1 vCPU / 2 GB (core 0) | 1 vCPU / 2 GB for both (core 0, 1 GB each) |
| Database | Postgres 17.6, 1 vCPU / 1 GB (core 2), `jit=off`, pool 10 | same | same |

Load: k6 in Docker (cores 3–4), open model (arrival rate). Page mix: article 45 %, category 25 %, home 20 %, search 10 %,
random locale. SLO: errors < 1 %, p95 < 500 ms, p99 < 1500 ms. `VACUUM ANALYZE` and `pg_stat_statements_reset()` before every run.

## Overview: ceiling on 1 vCPU (p95 < 500 ms, errors < 1 %)

| | Payload | EmDash | Strapi + Astro |
|---|---|---|---|
| No cache | ~95 RPS | ~150–165 RPS (Postgres-bound) | ~57 RPS |
| L1, data cache | ~145 RPS (Payload + Astro: ~540 RPS) | ~430 RPS (stale-cache race under load, see below) | not measured¹ |
| L2, page cache, full mix (search uncached) | ~400 RPS (Payload + Astro: ~1000 RPS) | ~1250 RPS | not measured¹ |
| L2, cached pages only | ~900 RPS (Payload + Astro: ≥ 2800 RPS) | ≥ 2600 RPS | not measured¹ |
| Invalidation under load, median (L1 / L2) | 0.14–0.3 s / 0.7–0.9 s | 0.15–0.23 s / 0.14–0.22 s | — |

Payload without Next (Astro pages calling the same Local API in-process, see below): **~155 RPS** without cache,
**~540 RPS** with the data cache (L1), invalidated from Payload by webhook: median 44–51 ms, 0 of 30 stale.

¹ Strapi has no built-in data or page cache. Caching in the Astro frontend would measure Astro (the EmDash
L2 numbers), not Strapi; third-party cache plugins were out of scope.

## Results (no cache)

| | Payload | EmDash |
|---|---|---|
| **Ceiling** (breakpoint, p95 < 500 ms) | **~95 RPS** | **~165 RPS** |
| Comfortable load (p95 ≈ 100 ms) | ~80 RPS | ~130 RPS |
| Bottleneck at the ceiling | CPU of the Node process (1.0 of 1) | Postgres (0.85 of 1); EmDash at 0.75 |
| Soak, 30 min | 65 RPS: p50 10 / p95 117 / p99 303 ms | 120 RPS: p50 11 / p95 69 / p99 168 ms |
| Memory under load | 250–380 MB, flat | 230–300 MB, flat |
| Errors in all runs | 0 | 0 |

### Steps (2-minute plateaus; p95 is the mean of 5-second p95 values)

| Target RPS | Payload p95 | Payload CPU / PG CPU | EmDash p95 | EmDash CPU / PG CPU |
|---|---|---|---|---|
| 20 | 36 ms | 0.26 / 0.08 | | |
| 40 | 32 ms | 0.45 / 0.14 | 24 ms | 0.21 / 0.24 |
| 60 | 60 ms | 0.62 / 0.19 | | |
| 80 | 107 ms | 0.78 / 0.24 | 28 ms | 0.37 / 0.44 |
| 100 | 239 ms, over capacity (95 RPS served) | 0.96 / 0.28 | | |
| 120 | | | 65 ms | 0.51 / 0.65 |
| 160 | | | 226 ms (159 RPS served) | 0.67 / 0.85 |
| 180 | | | collapse (164 RPS served) | 0.76 / 0.84 |

### Cost of one page view (50 RPS, 2-minute plateau)

| | Payload | EmDash |
|---|---|---|
| CMS process CPU, full page | 11.0 ms | 5.1 ms |
| … of which data (`/bench-data`, same calls, JSON, no rendering) | 6.6 ms | 4.5 ms |
| … of which rendering | 4.4 ms (Next/React) | 0.6 ms (Astro) |
| Postgres CPU | 3.3 ms | 5.8 ms |
| SQL queries | 7 | 5.8 |
| HTML size, home / article | 19.9 / 30.6 KB | 4.5 / 10.6 KB |

## Findings

- **EmDash serves ~1.7× more than Payload on the same budget.** The Payload process spends 11 ms of CPU per page:
  60 % in the Local API (query building, locale assembly, populate, hooks) and 40 % in React rendering, plus the RSC
  payload that makes its HTML 3–7× larger. EmDash's process needs 5 ms, rendering in Astro is almost free.
- **The bottleneck moves.** Payload saturates its Node process while Postgres stays at ~0.3 core. EmDash pushes the
  load onto Postgres: its listing query is large (terms, bylines, SEO, field metadata per row) and, without prepared
  statements, is planned on every call: ~1.4 ms planning vs ~0.3 ms execution.
- **For both, the price is per query, not per row.** Payload: 0.45 ms of execution for 7 queries vs 3.3 ms of
  Postgres CPU. Queries per page and query complexity matter more than data size.
- **Postgres tuning matters before measuring.** With default `jit=on` and no `ANALYZE` on tiny tables, Payload's
  menu query cost 12 ms of JIT compilation per call and halved throughput.
- **Single process.** Neither CMS uses more than one core out of the box. Payload with 4 `node:cluster` workers on
  4 cores reached ~240 RPS (×2.5) and was still CPU-bound in Node, with Postgres at 0.8 core.

## EmDash: what limits it

Three breakpoint runs with a `pg_stat_activity` sampler (every 500 ms) and cgroup throttling counters:

| Variant | Ceiling | EmDash CPU at the ceiling | Postgres CPU at the ceiling |
|---|---|---|---|
| base: Postgres 1 vCPU, pool 10 | ~150 RPS | 0.71 | 0.88 of 1 |
| Postgres 2 vCPU | **~235 RPS** | **0.96 of 1** | 1.24 of 2 |
| pool 20 | ~160 RPS | 0.65 | 0.82 of 1 |

- **Postgres is the limit, not the pool.** Up to the ceiling only 0.1–0.8 of 10 connections were busy on average; a
  pool of 20 changed nothing. At the ceiling active connections jump to ~3 with `LWLock:LockManager` waits.
- With a second core for Postgres the limit moves to the EmDash process (0.96 core) at ~235 RPS, ~2.5× Payload.
- A single core never shows 100 % at the ceiling: at 85–90 % utilisation the queue already pushes p95 past 500 ms.
- CPU throttling was negligible (< 1 s per run). Run-to-run spread of the ceiling is ~10 % (150 vs 165 RPS).

## Payload + Astro (no cache)

`payload-web/`: Astro pages call the Payload Local API in the same process through the very same
`payload/src/lib/data.ts` as the Next site (aliases to `payload/src`, `next/cache` stubbed out, rich text via
`convertLexicalToHTML`). Same database, budget (1 vCPU / 2 GB) and markup; the admin stays in the Next app.

| CPU per page view (50 RPS, 2-minute plateau) | Payload + Next | Payload + Astro | EmDash |
|---|---|---|---|
| Process, full page | 11.0 ms | **6.7 ms** | 5.1 ms |
| … data (`/bench-data`) | 6.6 ms | 6.0 ms | 4.5 ms |
| … rendering | 4.4 ms (React) | **0.8 ms** (Astro) | 0.6 ms |
| Postgres | 3.3 ms | 3.7 ms | 5.8 ms |
| **Ceiling** | ~95 RPS | **~155 RPS** (p95 217 ms at 143 RPS) | ~150–165 RPS |

- Replacing Next with Astro gives Payload +60 %, all of it from rendering; the Local API cost is unchanged.
- Payload + Astro and EmDash end up at the same ceiling for opposite reasons: Payload spends more in the Node
  process (6.0 vs 4.5 ms of data work) and less in Postgres (3.7 vs 5.8 ms). The app tier is the easier one to scale.
- Trade-offs: the admin runs in a separate Next process, so cache invalidation needs a webhook to the frontend;
  the image is 1.77 GB (full Payload in node_modules).

### With the data cache (L1)

`CMS_CACHE=data`: `payload-web` replaces the `next/cache` stub with an in-process cache with tags, so the same
`unstable_cache` calls in `data.ts` are cached. Writes happen in the Payload (Next) process; its collection hooks POST
the tags to `payload-web` (`REVALIDATE_URL` → `/api/revalidate`, shared secret).

| | Payload + Next L1 | Payload + Astro L1 | EmDash L1 |
|---|---|---|---|
| **Ceiling, full mix** | ~145 RPS | **~540 RPS** (search breaks; cached pages p95 131 ms) | ~430 RPS |
| Invalidation under load, median | 0.14–0.3 s | **44–51 ms** at 200 RPS | 0.15–0.23 s |
| Stale pages | 0 of 25 | **0 of 30** (15 immediate + 15 with a repeat after 500 ms) | 4 of 25 |

- The webhook is sent from `afterChange`, before the transaction commits, but little work is left before `COMMIT`
  and the HTTP hop takes longer, so no stale reads were seen; `REVALIDATE_REPEAT_MS` is a safety net that was not
  needed here. In EmDash the epoch is bumped synchronously with 100–600 ms of transaction still ahead.
- With caching, both Astro sites are bound by rendering plus the uncached search; Payload's search (Local API)
  is cheaper than the EmDash site's (raw SQL + a collection query with hydration).

### With the page cache (L2)

`PAYLOAD_WEB_CACHE=page` (build time): Astro route cache as on the EmDash site; the webhook also purges the route
cache (`cache.invalidate({ tags })`). Search and 404 are not cached.

| | Payload + Astro L2 | EmDash L2 | Payload + Next L2 |
|---|---|---|---|
| **Ceiling, full mix** | **~1000 RPS** (search breaks: p95 245 ms at 970, 693 ms at 1110 RPS) | ~1250 RPS | ~400 RPS |
| **Ceiling, cached pages only** | **≥ 2800 RPS** (p95 103 ms, CPU 0.95) | ≥ 2600 RPS | ~900 RPS |
| Invalidation at 500 / 600 / 200 RPS, median | 130–170 ms | 140–220 ms | 0.7–0.9 s |
| Stale pages | 0 of 15 | 0 of 15 | 0 of 15 |

**Tag granularity matters under load.** The first version tagged every page with the collection tags
(`articles`, …), so each edit emptied the whole cache: at 600 RPS every request then missed at once and re-rendered
(~6.7 ms each, i.e. ~4 cores of work on 1 core). Pages answered in 2–4 s, invalidation took 2.3–3.4 s and 1 of 15
pages stayed stale (a render started before the write finished after the purge). Astro's route cache does not
collapse concurrent misses for the same URL. EmDash's cache hints name the entries on the page, so it purges only
those. With document tags (`article:<id>`, `category:<id>`, sent by the Payload hook) an edit purges the article,
its category's pages and the home page; at 500 RPS p95 stayed at 51 ms, 0 of 15 stale
(`REVALIDATE_REPEAT_MS=500` as a safety net for in-flight renders).

## Strapi + Astro (no cache)

Strapi is headless, so the site is an Astro frontend (the EmDash site's pages and components) that reads Strapi's
REST API: menu, categories and article lists are separate HTTP calls (home 4, category 3, article 2, search 2).

| | |
|---|---|
| **Ceiling** | **~57 RPS** (p95 195 ms at 48 RPS, 254 ms at 58 RPS) |
| Bottleneck | the shared core: Strapi 0.69 + frontend 0.20 at the ceiling |
| Steps 10 / 20 / 30 / 50 RPS, p95 | 70 / 83 / 106 / 277 ms (the 40 RPS plateau had a single pause with p99 6 s) |
| Soak, 40 RPS, 30 min | p50 22 / p95 109 / p99 236 ms, 0 errors; memory flat (Strapi ~298 MB, frontend ~127 MB) |

Cost of one page view (30 RPS, 2-minute plateau):

| | Payload | EmDash | Strapi + Astro |
|---|---|---|---|
| Frontend CPU | in-process | in-process | 4.3 ms (render ~0.9 ms, HTTP client and JSON ~3.4 ms) |
| CMS CPU | 11.0 ms | 5.1 ms | 13.1 ms |
| **Total on the CMS core** | **11.0 ms** | **5.1 ms** | **17.4 ms** |
| Postgres CPU | 3.3 ms | 5.8 ms | 7.3 ms |
| SQL queries | 7 | 5.8 | 17.7 |

Each REST call checks the public role's permissions in the database (`up_permissions`, the most frequent query),
counts the total for pagination and loads every relation (cover, category, menu items) with a separate query.

## With cache, level 1: data cache

Each CMS caches query results in process memory with its own mechanism; pages are still rendered per request.
No TTL, event-based invalidation only. Search is never cached.

| | Payload | EmDash |
|---|---|---|
| Mechanism | `unstable_cache` around the Local API calls + `revalidateTag(tag, { expire: 0 })` in `afterChange`/`afterDelete` hooks (one tag per collection) | built-in `objectCache: memoryCache()`; per-collection epochs bumped on every write |
| SQL per cached page view | 0 | 0 |
| **Ceiling** | **~145 RPS** (was ~95) | **~430 RPS** (was ~150–165) |
| Bottleneck | Node CPU 0.92, Postgres 0.07 | Node CPU 0.97, Postgres 0.05 |
| First to break | search (uncached) | search (uncached) |

### Invalidation: change an article title through the CMS HTTP API, poll article, category page 1 and home every 50 ms

`load/invalidate.mjs`, times from the start of the write.

| | Payload | EmDash |
|---|---|---|
| No load | 80–160 ms | 70–120 ms |
| ~50 % of ceiling (70 / 210 RPS) | median 141 ms, max 201 ms, 0 of 10 stale | median 165–230 ms, **1 of 10 trials stale** |
| Payload 75 % (110 RPS) / EmDash 50 % (210 RPS), 15 trials | median 309 ms, max 676 ms, **0 of 15 stale** | **3 of 15 trials: a page kept the old title for > 15 s** |

**EmDash 1.4.0 race.** `ContentRepository.update` bumps the collection's cache epoch right after the `UPDATE`,
inside the transaction and before `COMMIT`; the transaction then runs several more statements (100–600 ms under
load). A reader in that window sees the new epoch, reads the not-yet-committed (old) row and caches it under the new
epoch, so the page stays stale until the next write to the collection or the TTL (`defaultTtl`, 1 h by default).
Payload/Next showed no stale reads in 25 trials.

Both in-memory caches only see writes made through the same process (admin, API). A write by another process,
e.g. `pnpm seed`, is not visible until restart (EmDash: or TTL).

## With cache, level 2: whole pages

The rendered HTML of a URL (query string included) is cached in process memory; search and 404 are not cached.

| | Payload | EmDash |
|---|---|---|
| Mechanism | Next full route cache (ISR): `app/(cached)` re-exports the pages with `dynamic = 'force-static'`, `next.config` rewrites the public URLs there (`?page=n` → path segment); hooks call `revalidatePath('/', 'layout')` | Astro 7 route cache (`cache: { provider: memoryCache() }`); pages pass the `cacheHint`s of their queries to `Astro.cache.set()`, EmDash's API purges the tags after a write |
| **Ceiling, full mix** | **~400 RPS** (search breaks) | **~1250 RPS** (search breaks) |
| **Ceiling, cached pages only** (article/category/home 50/28/22) | **~900 RPS** | **≥ 2600 RPS** (k6 at 0.9 of 2 cores) |
| CMS CPU per cached page served | ~1.1 ms | ~0.37 ms |
| Bottleneck | Node CPU 0.97 | Node CPU 0.97 |

Invalidation under load (50 % of the full-mix ceiling, 15 trials):

| | Payload, 200 RPS | EmDash, 600 RPS |
|---|---|---|
| Visible on article / category / home (median) | 677 / 885 / 886 ms | 140 / 216 / 167 ms |
| Max | 1.6 s | 0.86 s |
| Stale pages | 0 of 15 | 0 of 15 |

- EmDash's route-cache purge runs in the API handler after the write transaction has committed, so the L1 race
  does not apply here.
- Next pitfall: implicit page cache tags include route groups (`_N_T_/(cached)/cached/[locale]/layout`), so
  `revalidatePath('/cached/[locale]', 'layout')` silently matched nothing; `revalidatePath('/', 'layout')` works.

## Raw data

`<cms>-<profile>-<timestamp>.json` (k6 summary) and `.sql.txt` (top SQL from `pg_stat_statements`) in this folder:

- Strapi: `strapi-breakpoint-20261102-154310`, `strapi-steps-20261102-160524`, `strapi-soak-20261102-161827`,
  `strapi-pages-soak-20261102-154704`, `strapi-data-soak-20261102-155026`
- Payload + Astro: `payload-web-breakpoint-20261102-165243`, `payload-web-pages-soak-20261102-165858`,
  `payload-web-data-soak-20261102-170220`, `payload-web-l1-breakpoint-20261102-171756`,
  `payload-web-l1-inv-soak-20261102-172828`, `payload-web-l1-inv-repeat-soak-20261102-173401`,
  `payload-web-l2-breakpoint-20261102-183116`, `payload-web-l2-nosearch-breakpoint-20261102-184150`,
  `payload-web-l2-inv-soak-20261102-185223` (collection tags), `payload-web-l2-inv-tags-soak-20261102-191030`
- Payload: `payload-breakpoint-20261102-001945`, `payload-steps-20261102-005913`, `payload-soak-20261102-011216`,
  `payload-pages-soak-20261102-003737`, `payload-data-soak-20261102-004059`, `payload-4w-breakpoint-20261102-004905`
- EmDash: `emdash-breakpoint-20261102-040732`, `emdash-steps-20261102-101252`, `emdash-soak-20261102-102556`,
  `emdash-pages-soak-20261102-100557`, `emdash-data-soak-20261102-100920`,
  experiments `emdash-base-breakpoint-20261102-112810`, `emdash-pg2-breakpoint-20261102-113450`,
  `emdash-pool20-breakpoint-20261102-114452`
