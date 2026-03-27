# Lightdash Data Tools — 核心示例

配合 `SKILL.md` 使用。想最快跑通请看 **[quickstart.md](./quickstart.md)**；自定义维度、时区、表计算等见 **[examples-advanced.md](./examples-advanced.md)**。

## 1) 列出 explores

已配置 `LIGHTDASH_DEFAULT_PROJECT_UUID` 时可省略 `projectUuid`：

```json
{
  "tool": "lightdash_list_explores",
  "args": { "filtered": true }
}
```

未配置默认项目时：

```json
{
  "tool": "lightdash_list_explores",
  "args": { "projectUuid": "YOUR_PROJECT_UUID", "filtered": true }
}
```

## 2) 获取 explore 字段

```json
{
  "tool": "lightdash_get_explore",
  "args": {
    "projectUuid": "YOUR_PROJECT_UUID",
    "exploreId": "orders"
  }
}
```

先用返回结果确认真实 `fieldId`，再拼 query。

## 3) 执行 metric query（含筛选）

```json
{
  "tool": "lightdash_run_metric_query",
  "args": {
    "projectUuid": "YOUR_PROJECT_UUID",
    "query": {
      "exploreName": "orders",
      "dimensions": ["orders_order_date_day"],
      "metrics": ["orders_total_revenue"],
      "filters": {
        "dimensions": [
          {
            "id": "orders_status",
            "operator": "equals",
            "values": ["completed"]
          }
        ]
      },
      "sorts": [
        { "fieldId": "orders_order_date_day", "descending": false }
      ],
      "limit": 200,
      "tableCalculations": []
    },
    "pageSize": 500,
    "maxPollAttempts": 120,
    "pollIntervalMs": 500
  }
}
```
