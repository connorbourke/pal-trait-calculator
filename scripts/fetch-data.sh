#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-v1.18.3}"
mkdir -p "$ROOT/data"
curl -fsSL -o "$ROOT/data/db.source.json" \
  "https://raw.githubusercontent.com/tylercamp/palcalc/${TAG}/PalCalc.Model/db.json"
curl -fsSL -o "$ROOT/data/breeding.source.json" \
  "https://raw.githubusercontent.com/tylercamp/palcalc/${TAG}/PalCalc.Model/breeding.json"
echo "Downloaded palcalc ${TAG} dumps into data/"

# Field alpha levels (non-tower) for acquisition scoring metadata
if command -v node >/dev/null 2>&1; then
  (cd "$ROOT" && node scripts/fetch-field-alphas.mjs) || \
    echo "Warning: field-alphas fetch failed; keeping existing data/field-alphas.json if any"
fi
