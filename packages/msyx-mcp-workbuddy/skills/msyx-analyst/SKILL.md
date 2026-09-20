---
name: msyx-analyst
display_name: 马上赢X 分析助手
display_name_en: MSYX Analyst
description: Query 马上赢X explores, fields, and metrics via MCP; use when the user asks for data, charts, dashboards, or metric breakdowns.
description_zh: 通过 MCP 查马上赢X 探索、字段与指标；用户要数据、图表、看板或指标拆解时使用。
description_en: Query 马上赢X explores, fields, and metrics via MCP when the user needs data, charts, dashboards, or metric breakdowns.
category: data
version: 1.0.0
author: 马上赢X
---

# 马上赢X 分析助手（WorkBuddy）

通过本连接器的 MCP 工具查询马上赢X 数据。传输为 Streamable HTTP（无会话）。

## 调用前

1. 用户已在连接器表单填写 **API Key**。
2. 若不知道项目：先调 `list_projects`，再把返回的 `projectUuid` 传给后续工具。
3. 单项目入口若服务端已配默认项目，可不传 `projectUuid`。

## 推荐流程

1. `list_projects`（可选）→ 确认 `projectUuid`
2. `list_explores` / `find_explores` → `find_fields`
3. 需要枚举值 → `search_field_values`
4. 查数：
   - 简单扁平：`run_metric_query`（`exploreName` + `dimensions` + `metrics`）
   - 复杂 JSON：`run_semantic_metric_query`（`metricQuery`）
5. 大结果用 **`limit` + `offset`** 翻页，并带稳定 `sorts`；目录类工具用 `page` + `pageSize`，两套不要混用。

## 结果怎么读

- 查数工具的 `content[0]` 多为 **CSV**。
- 优先读 **`structuredContent`**（含 `rows`）；需要更完整字段信息时可设 `full: true`。

## 注意

- 没有「记住当前项目」：需要时带 `projectUuid`（或依赖服务默认项目）。
- 不要猜 `fieldId`；先 `find_fields`。
- 目录过滤需要时传 `catalogTags`。
- 鉴权失败时提示用户重新填写 API Key。
