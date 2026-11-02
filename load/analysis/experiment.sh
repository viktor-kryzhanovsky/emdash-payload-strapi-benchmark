#!/usr/bin/env bash
# One EmDash breakpoint run with a pg_stat_activity sampler and cgroup throttling counters
# (the "EmDash: what limits it" experiments in results/SUMMARY.md).
#   load/analysis/experiment.sh <variant>      -> results/experiments/<variant>/
# Variants are prepared by hand, see compose.experiments.yml.
set -euo pipefail
cd "$(dirname "$0")/../.."
V=$1
OUT=results/experiments/$V
mkdir -p "$OUT"

throttle() { for s in emdash postgres; do echo "$s $(docker compose exec -T $s cat /sys/fs/cgroup/cpu.stat | tr '\n' ' ')"; done; }
throttle > "$OUT/cpu.stat.before"
node load/analysis/pgsampler.mjs emdash_bench > "$OUT/activity.csv" &
SAMPLER=$!
VARIANT=$V ./load/run.sh breakpoint emdash -e MAX_RATE=300 2>&1 | grep -v Container || true
kill $SAMPLER
throttle > "$OUT/cpu.stat.after"
echo "done $V"
