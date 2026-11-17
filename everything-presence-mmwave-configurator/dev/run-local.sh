#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/dev/.logs"
FAKE_HA_PORT="${FAKE_HA_PORT:-8124}"
PORT="${PORT:-42069}"
export FAKE_HA_PORT

mkdir -p "$LOGS" "$ROOT/backend/data/fw_cache"
cd "$ROOT"

running() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }

wait_http() {
  local url="$1" name="$2" log="$3"
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null -H 'Authorization: Bearer fake' "$url" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  echo "$name did not come up; last log lines:" >&2
  tail -n 30 "$log" >&2
  exit 1
}

for pidfile in "$LOGS/fake-ha.pid" "$LOGS/backend.pid"; do
  if running "$pidfile"; then
    echo "Already running (pid $(cat "$pidfile")). Run dev/stop-local.sh first." >&2
    exit 1
  fi
done

if [[ ! -f "$ROOT/frontend/dist/index.html" ]]; then
  echo "Building frontend..."
  npm run build --workspace frontend > "$LOGS/frontend-build.log" 2>&1
fi

nohup node "$ROOT/dev/fake-ha/server.mjs" > "$LOGS/fake-ha.log" 2>&1 &
echo $! > "$LOGS/fake-ha.pid"
wait_http "http://127.0.0.1:$FAKE_HA_PORT/api/" "fake-ha" "$LOGS/fake-ha.log"

unset SUPERVISOR_TOKEN
HA_BASE_URL="http://127.0.0.1:$FAKE_HA_PORT" \
HA_LONG_LIVED_TOKEN=fake \
DATA_DIR="$ROOT/backend/data" \
FIRMWARE_CACHE_DIR="$ROOT/backend/data/fw_cache" \
PORT="$PORT" \
FIRMWARE_LAN_PORT="${FIRMWARE_LAN_PORT:-38080}" \
TS_NODE_PROJECT="$ROOT/backend/tsconfig.json" \
  nohup node -r ts-node/register/transpile-only "$ROOT/backend/src/index.ts" > "$LOGS/backend.log" 2>&1 &
echo $! > "$LOGS/backend.pid"
wait_http "http://127.0.0.1:$PORT/api/meta/health" "backend" "$LOGS/backend.log"

echo "fake-ha:  http://127.0.0.1:$FAKE_HA_PORT  (log: dev/.logs/fake-ha.log)"
echo "backend:  log dev/.logs/backend.log"
echo "Open:     http://127.0.0.1:$PORT"
