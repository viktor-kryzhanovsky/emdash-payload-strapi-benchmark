# CMS bench: Payload, EmDash, Strapi

Read-only load test of three Node.js CMSs on the full chain **site → CMS → Postgres**: the same blog
(20 articles × en/uk, 2 categories, menu, search) built on each, the same URLs, markup and CSS, the same data,
the same budget of **1 vCPU / 2 GB**, measured without cache and with two cache levels.

**Results and findings: [results/SUMMARY.md](results/SUMMARY.md).**

| Ceiling on 1 vCPU (p95 < 500 ms) | No cache | Data cache (L1) | Page cache (L2) |
|---|---|---|---|
| Payload 3.92 + Next 16 | ~95 RPS | ~145 RPS | ~400 RPS |
| Payload 3.92 + Astro 7 (Local API, no Next) | ~155 RPS | ~540 RPS | ~1000 RPS |
| EmDash 1.4 (Astro 7) | ~155 RPS | ~430 RPS | ~1250 RPS |
| Strapi 5.60 + Astro 7 (REST) | ~57 RPS | — | — |

RPS = page views per second (HTML). Page mix: article 45 %, category 25 %, home 20 %, search 10 %; search is never cached.

## Layout

| Path | What |
|---|---|
| `compose.yml` | everything: Postgres, the CMSs, k6, Prometheus, Grafana, exporters |
| `payload/` | Payload + Next site (Local API); `src/lib/data.ts` is the data layer, `src/app/(cached)` the page-cache routes |
| `payload-web/` | Astro site on the same Payload Local API (`payload/src/lib/data.ts` imported as is) |
| `emdash/` | EmDash site (Astro); schema in `seed/seed.json` |
| `strapi/`, `strapi-web/` | Strapi CMS and its Astro site (REST) |
| `data/` | the dataset generator (deterministic) and cover images |
| `load/` | k6 scenario, run script, invalidation test, analysis helpers |
| `monitoring/` | Prometheus config, Grafana provisioning and dashboard, Docker-API exporter |
| `postgres/init.sql` | databases and roles: `<cms>` for dev servers, `<cms>_bench` for the containers |
| `results/` | `SUMMARY.md` and raw run results |
| `tasks/` | follow-ups (an EmDash cache race to report upstream) |

## Requirements

- Docker Desktop with **6 CPUs** and ~8 GB of memory: containers are pinned to cores (see below).
- Node **24.22.1** (`.node-version` in each project; [fnm](https://github.com/Schniz/fnm) switches automatically),
  pnpm via corepack (`corepack enable`).
- k6 runs in Docker, nothing to install.

| Core | Used by |
|---|---|
| 0 | the CMS under test (one stack at a time) |
| 1 | spare (Postgres in the 2-core experiment) |
| 2 | Postgres (1 vCPU / 1 GB, `jit=off`, `pg_stat_statements`) |
| 3–4 | k6 |
| 5 | Prometheus, Grafana, exporters |

## Run it

```bash
# 1. database and monitoring
docker compose up -d postgres prometheus grafana postgres-exporter docker-exporter
# Grafana: http://localhost:3001 (dashboard "CMS bench"), Prometheus: http://localhost:9090

# 2. install the projects (needed for seeding from the host) and create their .env files
for p in payload payload-web emdash strapi strapi-web; do (cd $p && pnpm install); done
for p in payload emdash strapi; do cp -n $p/.env.example $p/.env; done
# emdash/.env: set EMDASH_ENCRYPTION_KEY to the output of `cd emdash && npx emdash secrets generate`
```

The `.env` files point the dev servers (`pnpm dev`) and seed scripts at the dev databases; the seed commands
below override the database name to fill the `*_bench` databases used by the containers.

Each CMS has a production container and a `*_bench` database. Start the container (it creates the schema),
then load the dataset from the host:

```bash
# Payload + Next, http://localhost:8080 (migrations run on start)
docker compose up -d --build --wait payload
(cd payload && NODE_ENV=production DATABASE_URL=postgres://payload:payload@127.0.0.1:5432/payload_bench pnpm seed)

# Payload + Astro, http://localhost:8083 (same payload_bench database)
docker compose up -d --build --wait payload-web

# EmDash, http://localhost:8081 (the first request runs migrations and the schema seed)
docker compose up -d --build --wait emdash
(cd emdash && PGDATABASE=emdash_bench pnpm seed)

# Strapi, CMS http://localhost:1338/admin, site http://localhost:8082
docker compose up -d --build --wait strapi-cms
(cd strapi && DATABASE_NAME=strapi_bench pnpm seed)
docker compose up -d --build --wait strapi
```

Stop the stacks you are not measuring (`docker compose stop <service>`): they share core 0.

The dataset is already in `data/`; to regenerate it: `node data/generate.mjs && node data/generate-covers.mjs`.

## Load tests

```bash
./load/run.sh <smoke|steps|breakpoint|soak> <cms> [-e NAME=value ...]

./load/run.sh smoke payload
./load/run.sh breakpoint emdash -e MAX_RATE=300            # linear ramp, stops when the SLO breaks
./load/run.sh steps strapi -e STEPS=10,20,30,40,50         # 30 s ramp + 2 min plateau per step
./load/run.sh soak payload -e RATE=65 -e DURATION=30m
DB=payload_bench ./load/run.sh breakpoint payload-web      # payload-web uses Payload's database
```

| Variable | Meaning |
|---|---|
| `RATE`, `STEPS`, `MAX_RATE`, `DURATION` | arrival rate (requests/s) per profile |
| `MIX=article:50,category:28,home:22` | page mix (default includes 10 % search) |
| `PREFIX=/bench-data` | the same data calls as JSON without rendering, to split CPU into data vs rendering |
| `VARIANT=l1` | label added to the test id |
| `TARGET`, `DB` (shell env) | override `http://<cms>:3000` and `<cms>_bench` |

Before every run the script runs `VACUUM ANALYZE` and resets `pg_stat_statements`; it keeps the Mac awake
(`caffeinate`), because display sleep stalls the Docker VM. Each run writes `results/<testid>.json` (k6 summary,
per-page percentiles) and `results/<testid>.sql.txt` (top SQL), and prints a Grafana link filtered to the run.

Open model (arrival rate): k6 keeps sending at the target rate when the server slows down. SLO: errors < 1 %,
p95 < 500 ms, p99 < 1500 ms; breakpoint runs abort on it.

## Cache modes

| Stack | Variable | Modes | Switch |
|---|---|---|---|
| Payload + Next | `PAYLOAD_CACHE` | `off`, `data` (`unstable_cache` + `revalidateTag` in hooks), `page` (full route cache, `app/(cached)` + rewrites) | `data`: restart; `page`: rebuild |
| EmDash | `EMDASH_CACHE` | `off`, `data` (`objectCache: memoryCache()`), `page` (Astro route cache + cache hints) | rebuild (baked into the build) |
| Payload + Astro | `PAYLOAD_WEB_CACHE` | `off`, `data` (in-process cache), `page` (Astro route cache, document tags); Payload hooks call a webhook | `data`: restart; `page`: rebuild; Payload needs `PAYLOAD_REVALIDATE_URL=http://payload-web:3000/api/revalidate` |

```bash
PAYLOAD_CACHE=page docker compose up -d --build --wait payload
EMDASH_CACHE=data docker compose up -d --build --wait emdash
PAYLOAD_REVALIDATE_URL=http://payload-web:3000/api/revalidate docker compose up -d --wait payload
PAYLOAD_WEB_CACHE=data docker compose up -d --wait payload-web
```

Invalidation test: changes an article title through the CMS API and polls the article, category and home pages
until the new title appears (run it while a soak keeps the site busy):

```bash
node load/invalidate.mjs payload 15
node load/invalidate.mjs payload-web 15                    # writes via Payload (:8080), reads payload-web (:8083)
EMDASH_TOKEN=$(cd emdash && PGDATABASE=emdash_bench node scripts/bench-token.mjs) node load/invalidate.mjs emdash 15
```

The EmDash admin signs in with passkeys only, so `bench-token.mjs` creates an admin user and API token directly in
the bench database. Payload's bench user is created on the first run (`first-register`).

## Experiments

- `compose.dbmax.yml`: Payload with 4 `node:cluster` workers on 4 cores, to push Postgres to its limit
  (`payload/cluster.mjs` starts workers one by one so `prodMigrations` does not run concurrently).
- `compose.experiments.yml`: Postgres on 2 cores (`PG_CPUSET=1,2 PG_CPUS=2`); EmDash pool size via
  `docker compose build --build-arg DATABASE_POOL_MAX=20 emdash` (emdash bakes its DB config into the build).
- `load/analysis/experiment.sh <variant>`: an EmDash breakpoint with a `pg_stat_activity` sampler and cgroup
  throttling counters; `timeline.mjs` and `plateaus.mjs` turn Prometheus data into the tables in the summary.
- `monitoring/grafana/generate-dashboard.mjs` regenerates the dashboard JSON.

## Things that bit us

- **Postgres JIT** compiled short CMS queries for ~12 ms each (bad row estimates on never-analyzed tiny tables):
  `jit=off` and `VACUUM ANALYZE` before runs.
- **One Node process uses one core.** A second vCPU gave Payload +20 %, so the budget is 1 vCPU per stack.
- **EmDash** bakes `astro.config` (DB config, pool size, object cache) into the build; full-text search is
  SQLite-only, so the sites search with `ILIKE` everywhere; its object cache can keep stale data under load
  (epoch bumped before `COMMIT`, see `tasks/emdash-object-cache-race.md`).
- **Next**: implicit page cache tags include route groups, so `revalidatePath('/cached/[locale]', 'layout')`
  silently matches nothing; `revalidatePath('/', 'layout')` works.
- **Strapi**: the production image needs `tsconfig.json`, otherwise `strapi start` loads no config
  (`Cannot destructure property 'client' of 'db.config.connection'`); importing `@strapi/strapi` as ESM fails,
  scripts are CommonJS.
- **Docker builds** are not pinned to cores: building an image during a run disturbs the measurement.
