# Lightdash MCP：Metric Query 工具选型

独立 MCP 包 `@lightdash/mcp` 提供 **两种互斥** 的指标查询工具，不要混用参数。

## 对比

| | `run_semantic_metric_query` | `run_metric_query` |
|---|---------------------------|-------------------|
| **适用** | AI、Explorer「复制 Metric Query」、多条件 `filters.dimensions.and` | 简单查询、Cursor 表单项 |
| **入参** | `metricQuery`（Explorer **JSON 字符串**，同 `run_sql.sql`） | `exploreName` + `dimensions[]` + `metrics[]` + … |
| **MCP 处理** | 直通 API（仅 parse、limit clamp、去掉空 `[]`/`{}`） | `toFilters`、`resolveFieldId` 等 |
| **出错** | 改 `metricQuery` 重试（类 SQL） | 检查扁平字段与 fieldId |

## 决策树

1. 是否有 Explorer 复制的整段 JSON，或需要保留 `filters.dimensions.and` 的 `id`/`required` 等？  
   → **`run_semantic_metric_query`**
2. 是否只需 1~2 个维度、1 个指标、简单 filters？  
   → **`run_metric_query`**

## 常见错误

| 现象 | 处理 |
|------|------|
| 语义与扁平参数混在同一调用里 | 二选一：语义用 `metricQuery`，扁平用 `exploreName` 等 |
| Explorer JSON 平铺在工具顶层 | 必须用 `run_semantic_metric_query({ metricQuery: { ... } })` |
| 422 | API 校验失败，改 JSON 内 fieldId/operator/values |
| `.filter is not a function` | 误用 `run_metric_query` 传整段 JSON，或 `dimensions`/`metrics` 不是数组 |

## 部署

```bash
pnpm -F @lightdash/mcp build
# 重启 MCP 服务后，在 Cursor 中重连
```

## 详细文档

- [语义 query（Explorer JSON）](./lightdash-mcp-run-semantic-metric-query.md)
- [扁平 query](./lightdash-mcp-run-metric-query-flat.md)
