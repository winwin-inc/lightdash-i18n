---
name: lightdash-metric-query
description: 【高级】构造或调试 run_metric_query（filters、sorts、customDimensions、timezone）。由 lightdash-insight-router 在需要时遵循；普通用户走 router 即可。
---

# Lightdash Metric Query（高级）

与 **router** 的关系：路由、类目枚举、调用次数与门禁见 **`../lightdash-insight-router/ROUTER-SOP.md`** 与 **`lightdash-insight-router`**；本技能只补 **query 形状与排障**。

## 强约束

- **扁平参数**，禁止嵌套 `query`。
- `filters` 为**对象**（map），禁止数组旧格式。
- `parameters` 必须是对象（`{}`），不能传字符串 `"{}"`。
- `context` 只传 Lightdash 枚举值（例如 `mcp`），不能传业务中文说明。

## 构造顺序

`exploreName` → `dimensions` / `metrics` → `filters` → `sorts` → `limit` → 可选 `tableCalculations`、`customDimensions`、`timezone`。

## 最小示例

`run_metric_query` 支持可选 **`projectUuid`**；省略时顺序与 **[insight-router/SKILL.md](../lightdash-insight-router/SKILL.md)** 及 **[`packages/lightdash-mcp/README.md`](../../lightdash-mcp/README.md)** 一致。

```json
{
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
- 422 优先判定为**请求校验失败**，先看 payload 类型与枚举值，不要直接归因权限。
- 含 `lightdash.user.email` 的模型过滤时，默认使用当前 PAT 对应用户邮箱；若邮箱未验证可能被后端置空。
- 排障顺序：字段 ID（`find_fields` / `list_explores` 与报错信息）→ `exploreName` → payload 类型与 `context` → 运算符与字段类型 → `limit`/sort → `timezone`。

详细检查清单：`./QUERY-CHECKLIST.md`
