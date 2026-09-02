#!/usr/bin/env bash
# Step 5 automated checks for feat/v2-upgrade (no DB / Docker required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> common build"
pnpm -F common build

echo "==> typecheck (common, warehouses, backend, frontend)"
pnpm -F common typecheck
pnpm -F warehouses typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck

echo "==> formula"
pnpm -F @lightdash/formula test

echo "==> generate-api"
pnpm generate-api

echo "==> MCP tests"
pnpm -F @lightdash/mcp test

echo "==> merge + filter unit tests"
(
  cd packages/backend
  npx jest MergeQueryBuilder.test.ts --passWithNoTests
)
(
  cd packages/common
  npx jest src/utils/filters.test.ts src/types/applyMetricOverrides.test.ts src/types/applyDimensionOverrides.test.ts --passWithNoTests
)

echo ""
echo "v2:verify passed (automated). See docs/v2-smoke-checklist.md for pre-prod manual steps."
