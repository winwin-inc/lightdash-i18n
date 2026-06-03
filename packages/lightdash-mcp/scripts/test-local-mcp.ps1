# 本地 MCP 冒烟测试：http://localhost:3333/mcp
# 用法：在 packages/lightdash-mcp 目录，且 start:http 已启动后执行 .\scripts\test-local-mcp.ps1

$ErrorActionPreference = 'Stop'
$McpUrl = 'http://localhost:3333/mcp'

function Get-ApiKey {
    # 与 Cursor 一致：优先用 ~/.cursor/mcp.json 里 lightdash 的 x-api-key
    $cursorMcp = Join-Path $env:USERPROFILE '.cursor\mcp.json'
    if (Test-Path $cursorMcp) {
        $j = Get-Content $cursorMcp -Raw | ConvertFrom-Json
        $key = $j.mcpServers.lightdash.headers.'x-api-key'
        if ($key) { return $key }
    }
    $envKey = $env:LIGHTDASH_API_KEY
    if ($envKey) { return $envKey }
    $envFile = Join-Path (Join-Path $PSScriptRoot '..') '.env'
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^LIGHTDASH_API_KEY=(.+)$') { return $Matches[1].Trim() }
        }
    }
    throw 'Missing API key: ~/.cursor/mcp.json x-api-key, LIGHTDASH_API_KEY, or .env'
}

function Invoke-Mcp {
    param(
        [string]$SessionId,
        [hashtable]$Body,
        [string]$ApiKey
    )
    $headers = @{
        'Content-Type' = 'application/json'
        'Accept'       = 'application/json, text/event-stream'
        'x-api-key'    = $ApiKey
    }
    if ($SessionId) { $headers['Mcp-Session-Id'] = $SessionId }
    $json = $Body | ConvertTo-Json -Depth 20 -Compress
    $resp = Invoke-WebRequest -Uri $McpUrl -Method POST -Headers $headers -Body $json -UseBasicParsing
    return $resp
}

function Parse-McpJsonBody {
    param([string]$Raw)
    $line = ($Raw -split "`n" | Where-Object { $_.Trim().StartsWith('data:') } | Select-Object -First 1)
    if ($line) {
        return ($line -replace '^data:\s*', '') | ConvertFrom-Json
    }
    return $Raw | ConvertFrom-Json
}

$apiKey = Get-ApiKey
Write-Host "==> 1. health"
$health = Invoke-RestMethod -Uri 'http://localhost:3333/health' -Method GET
Write-Host ($health | ConvertTo-Json -Compress)

Write-Host "`n==> 2. initialize"
$initResp = Invoke-Mcp -SessionId $null -ApiKey $apiKey -Body @{
    jsonrpc = '2.0'
    method  = 'initialize'
    params  = @{
        protocolVersion = '2024-11-05'
        capabilities    = @{}
        clientInfo      = @{ name = 'local-test'; version = '1.0.0' }
    }
    id = 1
}
$sessionId = $initResp.Headers['Mcp-Session-Id']
if (-not $sessionId) { $sessionId = $initResp.Headers['mcp-session-id'] }
if ($sessionId) { Write-Host "Session: $sessionId" } else { Write-Host 'Session: (stateless, no Mcp-Session-Id)' }

Write-Host "`n==> 3. notifications/initialized"
[void](Invoke-Mcp -SessionId $sessionId -ApiKey $apiKey -Body @{
    jsonrpc = '2.0'
    method  = 'notifications/initialized'
})

Write-Host "`n==> 4. tools/list"
$listResp = Invoke-Mcp -SessionId $sessionId -ApiKey $apiKey -Body @{
    jsonrpc = '2.0'
    method  = 'tools/list'
    id      = 2
}
$list = Parse-McpJsonBody -Raw $listResp.Content
$names = $list.result.tools.name | Sort-Object
Write-Host "tool count: $($names.Count)"
$need = @('run_semantic_metric_query', 'run_metric_query')
foreach ($t in $need) {
    if ($names -contains $t) { Write-Host "  OK $t" } else { Write-Host "  MISSING $t" }
}

$projectUuid = '3667f682-4080-44a4-8365-49f405936e09'
Write-Host "`n==> 5. set_project"
[void](Invoke-Mcp -SessionId $sessionId -ApiKey $apiKey -Body @{
    jsonrpc = '2.0'
    method  = 'tools/call'
    params  = @{
        name      = 'set_project'
        arguments = @{ projectUuid = $projectUuid }
    }
    id = 3
})

Write-Host "`n==> 6. run_metric_query (flat)"
$flatResp = Invoke-Mcp -SessionId $sessionId -ApiKey $apiKey -Body @{
    jsonrpc = '2.0'
    method  = 'tools/call'
    params  = @{
        name      = 'run_metric_query'
        arguments = @{
            projectUuid = $projectUuid
            exploreName = 'brand_cls4_insight_list'
            dimensions  = @('brand_cls4_insight_list_brand_name')
            metrics     = @('brand_cls4_insight_list_total_brand_growth_cls_4')
            filters     = @{
                dimensions = @{
                    and = @(
                        @{
                            target   = @{ fieldId = 'brand_cls4_insight_list_cls_4' }
                            operator = 'equals'
                            values   = @('运动饮料')
                        }
                        @{
                            target   = @{ fieldId = 'brand_cls4_insight_list_period' }
                            operator = 'equals'
                            values   = @('2026Q1')
                        }
                    )
                }
            }
            sorts       = @(
                @{
                    fieldId    = 'brand_cls4_insight_list_total_brand_growth_cls_4'
                    descending = $true
                }
            )
            limit       = 5
        }
    }
    id = 4
}
$flat = Parse-McpJsonBody -Raw $flatResp.Content
$flatText = $flat.result.content[0].text
$preview = if ($flatText.Length -gt 400) { $flatText.Substring(0, 400) + '...' } else { $flatText }
Write-Host $preview
if ($flatText -match 'FieldReferenceError|API 4\d\d:|执行失败') { throw 'run_metric_query failed' }

Write-Host "`n==> 7. run_semantic_metric_query (metricQuery JSON string, same as run_sql.sql)"
$metricQueryJson = (@{
    exploreName = 'brand_cls4_insight_list'
    dimensions  = @('brand_cls4_insight_list_brand_name')
    metrics     = @('brand_cls4_insight_list_total_brand_growth_cls_4')
    filters     = @{
        dimensions = @{
            and = @(
                @{
                    target   = @{ fieldId = 'brand_cls4_insight_list_cls_4' }
                    operator = 'equals'
                    values   = @('运动饮料')
                }
                @{
                    target   = @{ fieldId = 'brand_cls4_insight_list_period' }
                    operator = 'equals'
                    values   = @('2026Q1')
                }
            )
        }
    }
    sorts       = @(
        @{
            fieldId    = 'brand_cls4_insight_list_total_brand_growth_cls_4'
            descending = $true
        }
    )
    limit       = 5
} | ConvertTo-Json -Depth 20 -Compress)
$semanticResp = Invoke-Mcp -SessionId $sessionId -ApiKey $apiKey -Body @{
    jsonrpc = '2.0'
    method  = 'tools/call'
    params  = @{
        name      = 'run_semantic_metric_query'
        arguments = @{
            projectUuid = $projectUuid
            metricQuery = $metricQueryJson
            limit       = 5
        }
    }
    id = 5
}
$sem = Parse-McpJsonBody -Raw $semanticResp.Content
$semText = $sem.result.content[0].text
$semPreview = if ($semText.Length -gt 400) { $semText.Substring(0, 400) + '...' } else { $semText }
Write-Host $semPreview
if ($semText -match 'FieldReferenceError|API 4\d\d:|执行失败') { throw 'run_semantic_metric_query failed' }
if ($semText -notmatch ',' -and $semText -notmatch 'no tabular') {
    throw 'run_semantic_metric_query: unexpected response'
}

Write-Host "`nDone: local MCP smoke test passed."
