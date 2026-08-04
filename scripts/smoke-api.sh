#!/usr/bin/env bash
# Smoke-test production API. Usage:
#   PAL_API_KEY=... ./scripts/smoke-api.sh
set -euo pipefail

BASE="${BASE_URL:-https://pal-trait-calculator.vercel.app}"

json() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

echo "=== 1. GET /api/v1/health ==="
curl -sS "$BASE/api/v1/health" | json
echo

echo "=== 2. POST /api/v1/share (no key — expect 401) ==="
code=$(curl -sS -o /tmp/pal-smoke-share-nokey.json -w "%{http_code}" \
  -X POST "$BASE/api/v1/share" \
  -H "Content-Type: application/json" \
  -d '{"v":1,"mode":"chain","t":"Lyleen Noct","s":"Foxcicle"}')
echo "HTTP $code"
json < /tmp/pal-smoke-share-nokey.json
echo

if [[ -z "${PAL_API_KEY:-}" ]]; then
  echo "PAL_API_KEY not set — skipping authenticated checks."
  exit 0
fi

echo "=== 3. POST /api/v1/share (with key) ==="
curl -sS -X POST "$BASE/api/v1/share" \
  -H "Authorization: Bearer $PAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"v":1,"mode":"chain","t":"Lyleen Noct","s":"Foxcicle","tree":{"steps":[{"from":"Foxcicle","partner":"Lyleen","child":"Pierdon","pool":"3, clean"}]}}' \
  | json
echo

echo "=== 4. GET /api/v1/pals?q=Fox ==="
curl -sS "$BASE/api/v1/pals?q=Fox" | json
echo

echo "Done."
