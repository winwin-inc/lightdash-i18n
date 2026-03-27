# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the `@lightdash/skills` package — a collection of SKILL documents for Claude Code to interact with Lightdash via MCP (Model Context Protocol).

## Entry Skill

**For non-technical users, use `lightdash-insight-router` as the only entry point.** It handles three branches:
- **查已有图表/看板的数据** (search, view, run saved charts)
- **维度指标查询** (explore + metric query)
- **SQL/查表高级场景** (use SQL-like path when available, otherwise fallback to explore path)

## Tool Priority Order

| Priority | Tool | When to Use |
|----------|------|-------------|
| 1 | `lightdash_list_projects` | Don't know which project to use |
| 2 | `lightdash_search_content` | Find dashboards, saved charts, spaces by keyword |
| 3 | `lightdash_list_spaces` | List spaces (folders) in a project |
| 4 | `lightdash_get_saved_chart` | View chart name, parameters, data model |
| 5 | `lightdash_run_saved_chart` | Run saved chart with optional parameters override |
| 6 | `lightdash_list_explores` | List data models (not saved chart names) |
| 7 | `lightdash_get_explore` | Get field IDs (dimensions/metrics) |
| 8 | `lightdash_run_metric_query` | **Advanced**: custom query with self-selected fields |

## Workflow

1. **Always start by confirming project and time range**
2. **Prefer saved charts**: `search_content` → `get_saved_chart` → `run_saved_chart`
3. **Only use explore query when no saved chart fits**: `list_explores` → `get_explore` → `run_metric_query`
4. **Output should be concise**: Conclusion first, then key numbers with definitions

## Key Tools (via MCP)

- `lightdash_list_projects` — List projects you have access to
- `lightdash_search_content` — Search dashboards, charts, spaces
- `lightdash_list_spaces` — List spaces in a project
- `lightdash_get_saved_chart` — Get chart details and parameters
- `lightdash_run_saved_chart` — Execute saved chart with optional parameter overrides
- `lightdash_list_explores` — List available data models
- `lightdash_get_explore` — Get field metadata
- `lightdash_run_metric_query` — Execute custom metric queries

## Important Rules

- **Never guess field IDs** — Always use metadata from `lightdash_get_explore`
- **Never guess chartUuid** — Get from `lightdash_search_content` or user provided
- **Start small** — Test queries with limited data before scaling up
- **Security** — Never output or echo PAT tokens in conversation
- **Use business language** — Explain results with metrics definitions, not technical terms

## Advanced Skills

- `lightdash-metric-query` — For query debugging and advanced configurations (triggered by router when needed)