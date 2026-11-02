#!/usr/bin/env bash
# Usage: ./load/run.sh <smoke|steps|breakpoint|soak> [cms] [k6 -e options...]
#   ./load/run.sh smoke
#   ./load/run.sh steps emdash -e STEPS=10,20,40
#   ./load/run.sh soak payload -e RATE=40 -e DURATION=30m
#   VARIANT=data ./load/run.sh soak payload -e PREFIX=/bench-data   (VARIANT goes into the test id)
#
# Writes results/<testid>.json (k6 summary) and results/<testid>.sql.txt (top SQL from pg_stat_statements).
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE=${1:-smoke}
CMS=${2:-payload}
shift $(( $# > 2 ? 2 : $# ))
TARGET=${TARGET:-http://$CMS:3000}
DB=${DB:-${CMS}_bench}
TESTID="$CMS${VARIANT:+-$VARIANT}-$PROFILE-$(date +%Y%m%d-%H%M%S)"

mkdir -p results
psql() { docker compose exec -T postgres psql -U payload -d "$DB" "$@"; }

echo "== $TESTID -> $TARGET"
# Fresh planner statistics (tiny tables like the menu are never auto-analyzed) and clean query stats.
psql -qc 'VACUUM ANALYZE' -c 'SELECT pg_stat_statements_reset()' >/dev/null

# macOS: keep the display/system awake, otherwise display sleep stalls the Docker VM for seconds.
KEEPAWAKE=(); command -v caffeinate >/dev/null && KEEPAWAKE=(caffeinate -dims)

"${KEEPAWAKE[@]}" docker compose run --rm --quiet-pull \
  -e PROFILE="$PROFILE" -e CMS="$CMS" -e TARGET="$TARGET" -e TESTID="$TESTID" \
  k6 run -q -o experimental-prometheus-rw "$@" /scripts/bench.js || status=$?

# Most expensive queries during the run.
psql -P pager=off -c "
  SELECT calls,
         round(total_exec_time::numeric) AS total_ms,
         round(mean_exec_time::numeric, 2) AS mean_ms,
         rows / NULLIF(calls, 0) AS rows_per_call,
         left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query
  FROM pg_stat_statements
  WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  ORDER BY total_exec_time DESC
  LIMIT 15" > "results/$TESTID.sql.txt"

echo "== results/$TESTID.json, results/$TESTID.sql.txt"
echo "== Grafana: http://localhost:3001/d/cms-bench?var-testid=$TESTID&from=now-30m"
exit "${status:-0}"
