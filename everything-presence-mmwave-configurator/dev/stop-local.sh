#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/dev/.logs"

stop_pid() {
  local pid="$1" name="$2"
  kill -0 "$pid" 2>/dev/null || return 0
  kill "$pid" 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || { echo "stopped $name ($pid)"; return 0; }
    sleep 0.25
  done
  kill -9 "$pid" 2>/dev/null && echo "killed $name ($pid)"
}

for name in backend fake-ha; do
  pidfile="$LOGS/$name.pid"
  [[ -f "$pidfile" ]] && stop_pid "$(cat "$pidfile")" "$name"
  rm -f "$pidfile"
done

# Orphans from earlier runs: only processes whose cwd is this checkout.
for pid in $(pgrep -f '^node .*(dev/fake-ha/server\.mjs|backend/src/index\.ts)' || true); do
  [[ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" == "$ROOT" ]] && stop_pid "$pid" "orphan"
done
exit 0
