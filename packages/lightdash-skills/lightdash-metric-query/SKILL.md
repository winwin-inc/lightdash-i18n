---
name: lightdash-metric-query
description: 【高级】构造或调试 lightdash_run_metric_query（filters、sorts、customDimensions、timezone）。由 lightdash-insight-router 在需要时遵循；普通用户走 router 即可。
---

# Lightdash Metric Query（高级）

与 **router** 的关系：路由、类目枚举、调用次数与门禁见 **`../lightdash-insight-router/ROUTER-SOP.md`** 与 **`lightdash-insight-router`**；本技能只补 **query 形状与排障**。

## 强约束

- **扁平参数**，禁止嵌套 `query`。
- `filters` 为**对象**（map），禁止数组旧格式。

## 构造顺序

`exploreName` → `dimensions` / `metrics` → `filters` → `sorts` → `limit` → 可选 `tableCalculations`、`customDimensions`、`timezone`。

## 最小示例

```json
{
  "projectUuid": "<projectUuid>",
  "exploreName": "orders",
  "dimensions": ["orders_created_date_month"],
  "metrics": ["orders_total_revenue"],
  "filters": {},
  "sorts": [],
  "limit": 100
}
```

## 过滤与排障

- 复杂条件：**先单条件**，再叠加；空结果时先去掉 filters 验证链路。
- 排障顺序：字段 ID（`get_explore`）→ `exploreName` → 运算符与字段类型 → `limit`/sort → 是否需要 `timezone`。

详细检查清单：`./QUERY-CHECKLIST.md`
