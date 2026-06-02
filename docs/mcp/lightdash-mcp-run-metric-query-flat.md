# run_metric_query（扁平 Metric Query）

用于 **简单** 指标查询，只传顶层字段：`exploreName`、`dimensions[]`、`metrics[]` 等。

Explorer 整段 JSON 请用 [`run_semantic_metric_query`](./lightdash-mcp-run-semantic-metric-query.md)。

## 最小示例

```json
{
  "exploreName": "orders",
  "dimensions": ["orders_order_date_month"],
  "metrics": ["orders_total_order_amount"],
  "filters": {},
  "sorts": [],
  "limit": 50
}
```

## 带简单筛选

```json
{
  "exploreName": "orders",
  "dimensions": ["orders_status"],
  "metrics": ["orders_unique_order_count"],
  "filters": {
    "dimensions": {
      "and": [
        {
          "target": { "fieldId": "orders_status" },
          "operator": "equals",
          "values": ["completed"]
        }
      ]
    }
  },
  "limit": 100
}
```

复杂多条件 `filters.dimensions.and`（含 Explorer 的 `id`/`required`）建议改用 **语义工具**，避免 MCP 扁平解析与 Explorer 结构不一致。

## 字段 ID 从哪来

1. `list_explores` → 确认 `exploreName`  
2. `find_fields` → 查 `fieldId`  
3. 或在 Explorer 界面复制字段 ID 后，简单查询可填本工具

## 可选：requiredFilterFieldIds

顶层字符串数组；explore 要求必筛字段时，若 `filters` 中缺少对应 fieldId，MCP 会提前报错（仅扁平工具）。

## 相关

- [选型总览](./lightdash-mcp-metric-query-guide.md)
- [语义 query](./lightdash-mcp-run-semantic-metric-query.md)
