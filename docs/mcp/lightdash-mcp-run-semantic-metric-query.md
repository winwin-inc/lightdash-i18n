# run_semantic_metric_query（语义 Metric Query）

面向 **Explorer 复制的整段 Metric Query**。MCP **不改写** filters 结构；校验由 **Lightdash API** 完成，失败则修改 `metricQuery` 后重试。

## 调用方式

```json
{
  "projectUuid": "可选-项目-uuid",
  "metricQuery": {
    "exploreName": "...",
    "dimensions": ["..."],
    "metrics": ["..."],
    "filters": { "dimensions": { "and": [ ... ] } },
    "sorts": [ { "fieldId": "...", "descending": true } ],
    "limit": 500
  }
}
```

可选顶层 `limit` 覆盖 `metricQuery.limit`。

## 从 Explorer 复制

1. 在 Lightdash Explorer 配好图表查询  
2. 复制 **Metric Query JSON**  
3. 调用 `run_semantic_metric_query`，传入 **`metricQuery`**  
4. 以下字段无内容时可不传（MCP 会自动忽略空 `[]` / `{}`）：
   - `tableCalculations: []`
   - `additionalMetrics: []`
   - `customDimensions: []`
   - `metricOverrides: {}`

## 完整示例：brand_cls4_insight_list

```json
{
  "metricQuery": {
    "exploreName": "brand_cls4_insight_list",
    "dimensions": ["brand_cls4_insight_list_brand_name"],
    "metrics": ["brand_cls4_insight_list_total_brand_growth_cls_4"],
    "filters": {
      "dimensions": {
        "id": "73364a83-eeae-4dff-bf44-5aeebc6b124b",
        "and": [
          {
            "id": "f6a6cb30-b620-4ebe-ac57-42c63934eecc",
            "target": { "fieldId": "brand_cls4_insight_list_brand_name" },
            "values": ["其他品牌"],
            "operator": "notEquals",
            "required": false
          },
          {
            "id": "1865bbc6-8979-41fa-8475-36967842c082",
            "target": { "fieldId": "brand_cls4_insight_list_cls_4" },
            "operator": "equals",
            "values": ["运动饮料"],
            "required": false
          },
          {
            "id": "c10ebcb8-7839-44a1-b56a-1bd077cdb410",
            "target": { "fieldId": "brand_cls4_insight_list_period" },
            "operator": "equals",
            "values": ["2026Q1"],
            "required": false
          }
        ]
      }
    },
    "sorts": [
      {
        "fieldId": "brand_cls4_insight_list_total_brand_growth_cls_4",
        "descending": true
      }
    ],
    "limit": 500
  }
}
```

## 只改类目（运动饮料 → 非冷藏即饮果汁）

**仅修改** 第二条规则的 `values`，其余字段（`target.fieldId`、`operator`、`id`）保持不变：

```json
"values": ["非冷藏即饮果汁"]
```

对应 `fieldId`: `brand_cls4_insight_list_cls_4`。

## 给 AI 的提示词示例

> 使用 `run_semantic_metric_query`，将下列 metricQuery 原样传入；把 cls_4 筛选从「运动饮料」改为「非冷藏即饮果汁」。

## 错误排查

| HTTP / 文案 | 说明 |
|-------------|------|
| 422 | 字段/运算符/枚举值不合法，或 filters 结构不符合 API |
| 401 / 403 | PAT 或项目权限 |
| 空结果 | 筛选值在数据中不存在，用 `search_field_values` 核对 |

返回首条为 **CSV**；`full=true` 时可拿完整 JSON。

## 相关

- [选型总览](./lightdash-mcp-metric-query-guide.md)
- [扁平 query](./lightdash-mcp-run-metric-query-flat.md)
