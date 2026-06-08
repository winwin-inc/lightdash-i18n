# Lightdash MCP 查询工具速查

独立包 `@lightdash/mcp` 的三个查询工具，**互斥选型，勿混参**。

## 选型

| 场景 | 工具 |
|------|------|
| Explorer「复制 Metric Query」、多条件 `filters.dimensions.and` | `run_semantic_metric_query` |
| 手写简单查询（1~2 维 + 1 指标） | `run_metric_query` |
| 语义层表达不了，需原生 SQL | `run_sql` |

## 前置

- PAT：`x-api-key` 或 `LIGHTDASH_API_KEY`
- 项目：先 `set_project`，或传 `projectUuid`
- 默认返回 CSV
- `valueFormat`（默认 raw）：扁平 CSV / `structuredContent.rows` 用原值或 Explorer 展示值
- `full=true`：structuredContent 含嵌套 rows、fields、warnings；content 追加完整 JSON（与 valueFormat 正交）

---

## `run_semantic_metric_query`（主路径，对齐 `run_sql`）

参数表与 `run_sql` 同级：`projectUuid`、`metricQuery`（string）、`limit`、`invalidateCache`、`full`、`valueFormat`。

Explorer 复制 Metric Query → **整段 JSON 字符串**放进 `metricQuery`：

```json
{
  "projectUuid": "可选",
  "metricQuery": "{\"exploreName\":\"my_explore\",\"dimensions\":[\"my_explore_dim\"],\"metrics\":[\"my_explore_metric\"],\"filters\":{},\"limit\":100}",
  "limit": 100
}
```

- 禁止平铺 `exploreName` / `dimensions` / `filters` 到顶层
- JSON 内 `dimensions` / `metrics` 必须是字符串数组
- 改筛选只改 `filters...values`，与 Explorer 下拉完全一致

---

## `run_metric_query`（简单查询）

顶层扁平参数；**禁止**传 `metricQuery`。

```json
{
  "exploreName": "orders",
  "dimensions": ["orders_status"],
  "metrics": ["orders_unique_order_count"],
  "filters": {},
  "limit": 50
}
```

---

## `run_sql`（最后手段）

```json
{
  "sql": "SELECT col FROM schema.table LIMIT 100"
}
```

- 仅 `SELECT` / `WITH` 开头

---

## 常见错误

| 现象 | 原因 |
|------|------|
| `请勿传扁平字段` | 未把 JSON 放进 `metricQuery` 字符串 |
| `请使用 run_semantic_metric_query` | flat 工具里传了 `metricQuery` |
| `.filter is not a function` | Explorer JSON 误用 `run_metric_query` |
| 422 | fieldId / operator / values 不合法 |
| 无 `run_semantic_metric_query` | 连的是主站内置 MCP，需换独立 `@lightdash/mcp` |
