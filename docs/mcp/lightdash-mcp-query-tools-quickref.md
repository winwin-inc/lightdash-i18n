# Lightdash MCP 查询工具速查

指标查询**二选一，勿混参**。传输层见 [标准客户端用法](./lightdash-mcp-client-usage.md)。

| 场景 | 工具 |
|------|------|
| Explorer 复制整段 Metric Query、多条件 `filters.dimensions.and` | `run_semantic_metric_query` |
| 1～2 维 + 1 指标、简单 filters | `run_metric_query` |

**前置：** 每次传 `projectUuid`；PAT 用 `x-api-key`；默认 CSV。

### `run_semantic_metric_query`

`metricQuery` 必须是 **JSON 字符串**（Explorer 整段），不要把字段平铺到顶层。

```json
{
  "projectUuid": "推荐每次传",
  "metricQuery": "{\"exploreName\":\"my_explore\",\"dimensions\":[\"my_explore_dim\"],\"metrics\":[\"my_explore_metric\"],\"filters\":{},\"limit\":100}",
  "limit": 100
}
```

### `run_metric_query`

顶层扁平参数；**禁止**传 `metricQuery`。

```json
{
  "projectUuid": "推荐每次传",
  "exploreName": "orders",
  "dimensions": ["orders_status"],
  "metrics": ["orders_unique_order_count"],
  "filters": {},
  "limit": 50
}
```

### 常见错误

| 现象 | 处理 |
|------|------|
| 语义/扁平混用 | 二选一 |
| Explorer JSON 平铺顶层 | 放进 `metricQuery` 字符串 |
| `.filter is not a function` | 误用了 `run_metric_query` |
| 422 | 检查 fieldId / operator / values |
