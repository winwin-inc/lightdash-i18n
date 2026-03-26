# Lightdash Data Tools — 进阶示例

在掌握 [examples.md](./examples.md) 三节后使用。

## customDimensions（查询内临时 SQL 维度）

```json
{
  "tool": "lightdash_run_metric_query",
  "args": {
    "projectUuid": "YOUR_PROJECT_UUID",
    "query": {
      "exploreName": "orders",
      "customDimensions": [
        {
          "id": "orders__custom_is_large_order",
          "name": "is_large_order",
          "table": "orders",
          "type": "sql",
          "dimensionType": "STRING",
          "sql": "CASE WHEN ${orders.total_revenue} >= 1000 THEN 'large' ELSE 'normal' END"
        }
      ],
      "dimensions": ["orders__custom_is_large_order"],
      "metrics": ["orders_total_revenue", "orders_count"],
      "filters": {
        "dimensions": [
          {
            "id": "orders__custom_is_large_order",
            "operator": "equals",
            "values": ["large"]
          }
        ]
      },
      "sorts": [{ "fieldId": "orders_total_revenue", "descending": true }],
      "limit": 100,
      "tableCalculations": []
    }
  }
}
```

注意：`customDimensions[].id` 与 `dimensions` / `filters.dimensions[].id` 一致；`sql` 用 Lightdash 可解析引用（如 `${orders.total_revenue}`）；编译失败时先在 Explore 里验证片段。

## 日期范围（inThePast）

```json
{
  "tool": "lightdash_run_metric_query",
  "args": {
    "projectUuid": "YOUR_PROJECT_UUID",
    "query": {
      "exploreName": "orders",
      "dimensions": ["orders_order_date_day"],
      "metrics": ["orders_count"],
      "filters": {
        "dimensions": [
          {
            "id": "orders_order_date_day",
            "operator": "inThePast",
            "values": ["30 days"]
          }
        ]
      },
      "sorts": [{ "fieldId": "orders_order_date_day", "descending": false }],
      "limit": 500,
      "tableCalculations": []
    }
  }
}
```

## timezone

```json
{
  "tool": "lightdash_run_metric_query",
  "args": {
    "projectUuid": "YOUR_PROJECT_UUID",
    "query": {
      "exploreName": "orders",
      "dimensions": ["orders_order_date_day"],
      "metrics": ["orders_total_revenue"],
      "filters": {},
      "sorts": [{ "fieldId": "orders_order_date_day", "descending": false }],
      "limit": 200,
      "tableCalculations": [],
      "timezone": "Asia/Shanghai"
    }
  }
}
```

## tableCalculations

```json
{
  "tool": "lightdash_run_metric_query",
  "args": {
    "projectUuid": "YOUR_PROJECT_UUID",
    "query": {
      "exploreName": "orders",
      "dimensions": ["orders_order_date_day"],
      "metrics": ["orders_total_revenue", "orders_count"],
      "filters": {},
      "sorts": [{ "fieldId": "orders_order_date_day", "descending": false }],
      "limit": 100,
      "tableCalculations": [
        {
          "name": "avg_revenue_per_order",
          "displayName": "avg_revenue_per_order",
          "sql": "${orders_total_revenue} / NULLIF(${orders_count}, 0)"
        }
      ]
    }
  }
}
```

## 无默认 projectUuid 的调用链

未配置 `LIGHTDASH_DEFAULT_PROJECT_UUID` 时，三步都传同一 `projectUuid`：

1. `lightdash_list_explores`
2. `lightdash_get_explore`
3. `lightdash_run_metric_query`

建议会话内固定 `projectUuid`，避免漏传。

## 排障

- 401/403：检查 PAT 是否可访问该项目
- 字段不存在：先 `lightdash_get_explore`，不要猜字段
- 查询超时：减小 `limit`、减少维度、加筛选
- 空结果：先去掉 `filters` 验证链路，再逐步加回过滤
