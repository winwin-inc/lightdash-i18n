---
name: lightdash-metric-query
description: 【高级】构造或调试 run_semantic_metric_query（Explorer metricQuery）与 run_metric_query（扁平）。由 lightdash-insight-router 在需要时遵循。
---

# Lightdash Metric Query（高级）

与 **router** 的关系见 **[`../lightdash-insight-router/SKILL.md`](../lightdash-insight-router/SKILL.md)**。本技能补 **两种 MCP 工具** 的用法与排障。

## 工具分工

| 工具 | 场景 |
|------|------|
| **`run_semantic_metric_query`** | Explorer 复制整段 JSON → 参数 **`metricQuery`**（默认） |
| **`run_metric_query`** | 仅扁平：`exploreName` + `dimensions[]` + `metrics[]` |

规则以 MCP **`tools/list`** 里各工具的 **description** 为准（`run_semantic_metric_query` / `run_metric_query`），勿依赖仓库内 `docs/mcp`。

## 语义 query（强约束）

- 只传 **`metricQuery`**。
- 改筛选：**只改** `filters.dimensions.and[i].values`。
- 422：改 `metricQuery` 后重试。

## 扁平 query（强约束）

- 只传 `exploreName`、`dimensions[]`、`metrics[]` 等顶层字段。
- `filters` 为对象；`parameters` 为 `{}`；`context` 枚举（如 `mcp`）。

## 排障顺序

1. `fieldId` / `exploreName`（`find_fields`、`list_explores`）
2. 是否用错工具（整段 JSON 必须 `run_semantic_metric_query` + `metricQuery`）
3. `parameters` / `filters` / `context` 类型
4. 运算符与枚举 `values` 是否与 Explorer 一致
5. `limit` / `sorts`；PAT 与项目权限
