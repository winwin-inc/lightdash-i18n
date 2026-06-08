# run_semantic_metric_query（语义 Metric Query）

面向 **Explorer 复制的整段 Metric Query**。参数形态与 **`run_sql` 对齐**：`metricQuery` 为 **JSON 字符串**，Apifox/Cursor 显示单个文本框。

MCP **不改写** filters 结构；校验由 **Lightdash API** 完成，失败则修改 `metricQuery` 后重试。

## 调用方式

参数：`projectUuid`（可选）、`metricQuery`（string，必填）、`limit`、`invalidateCache`、`full`、`valueFormat`（可选，`raw` | `formatted`，默认 `raw`）。

```json
{
  "projectUuid": "可选-项目-uuid",
  "metricQuery": "{\"exploreName\":\"...\",\"dimensions\":[\"...\"],\"metrics\":[\"...\"],\"filters\":{\"dimensions\":{\"and\":[]}},\"sorts\":[],\"limit\":500}",
  "limit": 500
}
```

可选顶层 `limit` 覆盖 JSON 内的 `limit`。

## 从 Explorer 复制

1. 在 Lightdash Explorer 配好图表查询  
2. 复制 **Metric Query JSON**  
3. 调用 `run_semantic_metric_query`，将 JSON **作为字符串**传入 `metricQuery`  
4. 以下字段无内容时可不传（MCP 会自动忽略空 `[]` / `{}`）：
   - `tableCalculations: []`
   - `additionalMetrics: []`
   - `customDimensions: []`
   - `metricOverrides: {}`

## 只改类目（运动饮料 → 非冷藏即饮果汁）

在 JSON 字符串内，**仅修改** cls_4 那条 filter 的 `values`，其余不动：

```json
"values": ["非冷藏即饮果汁"]
```

对应 `fieldId`: `brand_cls4_insight_list_cls_4`。

## 给 AI 的提示词示例

> 使用 `run_semantic_metric_query`，将 Explorer 复制的 Metric Query **作为 JSON 字符串**传入 `metricQuery`（用法同 run_sql 的 sql）；把 cls_4 筛选从「运动饮料」改为「非冷藏即饮果汁」。

## 错误排查

| HTTP / 文案 | 说明 |
|-------------|------|
| 422 | 字段/运算符/枚举值不合法，或 filters 结构不符合 API |
| 401 / 403 | PAT 或项目权限 |
| 请勿传扁平字段 | 须把整段 JSON 放进 `metricQuery` 字符串，不要平铺 exploreName 等 |
| 空结果 | 筛选值在数据中不存在，用 `search_field_values` 核对 |

返回首条为 **CSV**（默认 API 原值，`valueFormat=formatted` 为 Explorer 展示值）；`full=true` 时 structuredContent 含 fields/warnings 且 content 追加完整 JSON。

## 相关

- [选型总览](./lightdash-mcp-metric-query-guide.md)
- [扁平 query](./lightdash-mcp-run-metric-query-flat.md)
- [三工具速查](./lightdash-mcp-query-tools-quickref.md)
