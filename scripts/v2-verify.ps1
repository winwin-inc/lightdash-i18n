# Step 5 automated checks for feat/v2-upgrade (no DB / Docker required).
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "==> common build"
pnpm -F common build

Write-Host "==> typecheck (common, warehouses, backend, frontend)"
pnpm -F common typecheck
pnpm -F warehouses typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck

Write-Host "==> formula"
pnpm -F @lightdash/formula test

Write-Host "==> generate-api"
pnpm generate-api

Write-Host "==> MCP tests"
pnpm -F @lightdash/mcp test

Write-Host "==> merge + filter unit tests"
Push-Location packages/backend
npx jest MergeQueryBuilder.test.ts --passWithNoTests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location
Push-Location packages/common
npx jest src/utils/filters.test.ts src/types/applyMetricOverrides.test.ts src/types/applyDimensionOverrides.test.ts --passWithNoTests
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location

Write-Host ""
Write-Host "v2:verify passed (automated). See docs/v2-smoke-checklist.md for pre-prod manual steps."
