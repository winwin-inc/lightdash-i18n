# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the `@lightdash/skills` package — a collection of SKILL documents for Claude Code to interact with Lightdash via MCP (Model Context Protocol).

## When to Use This Package

Use this package when:
- Querying data from Lightdash (explores, metrics, saved charts)
- Performing ad-hoc data analysis with custom dimensions/metrics
- Browsing projects, spaces, and saved content

## Key Tools (via MCP)

- `lightdash_list_explores` — List available data models
- `lightdash_get_explore` — Get field metadata for an explore
- `lightdash_run_metric_query` — Execute custom metric queries

## Workflow

1. Always start with `lightdash_list_explores` to find available explores
2. Use `lightdash_get_explore` to get field IDs (never guess field names)
3. Execute query with `lightdash_run_metric_query`

## Important Rules

- **Never guess field IDs** — Always use the metadata from `lightdash_get_explore`
- **Start small** — Test queries with limited data before scaling up
- **Security** — Never output or echo PAT tokens in conversation
