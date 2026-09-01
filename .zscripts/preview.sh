#!/bin/bash
# Serve the PRODUCTION build (dist/) on port 3000 with the real service worker.
# Modeled on dev.sh so the process survives the launching shell.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is not installed"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %d %H:%M:%S')] Starting vite preview (production build)…"
bun run preview &
DEV_PID=$!
echo "[$(date '+%Y-%m-%d %H:%M:%S')] vite preview running (PID: $DEV_PID)"

for attempt in $(seq 1 40); do
  if curl -s --connect-timeout 2 --max-time 5 http://localhost:3000 >/dev/null 2>&1; then
    echo "vite preview is ready."
    break
  fi
  sleep 1
done

curl -fsS localhost:3000 >/dev/null
echo "Health check passed."
disown "$DEV_PID" 2>/dev/null || true
unset DEV_PID
echo "vite preview is running in background."
