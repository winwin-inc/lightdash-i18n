---
name: lightdash-metric-query
description: 【高级】构造或调试 run_metric_query（filters、sorts、customDimensions、timezone）。由 lightdash-insight-router 在需要时遵循；普通用户走 router 即可。
---

# Lightdash Metric Query（高级）

与 **router** 的关系：路由、类目、调用次数见 **[`../lightdash-insight-router/ROUTER-SOP.md`](../lightdash-insight-router/ROUTER-SOP.md)** 与 **[`../lightdash-insight-router/SKILL.md`](../lightdash-insight-router/SKILL.md)**。本技能只补 **`run_metric_query` 形状与排障**。

## 强约束

- **扁平参数**，禁止嵌套 `query`；`filters` 为**对象**（map），禁止数组旧格式。
- `parameters` 须为对象 `{}`，禁止字符串 `"{}"`；`context` 仅 Lightdash 枚举（如 `mcp`），禁止业务中文当枚举。

构造顺序、逐项排障与校验清单见 **[`QUERY-CHECKLIST.md`](./QUERY-CHECKLIST.md)**。

## 最小示例

`run_metric_query` 可选 **`projectUuid`**；省略时与 **[insight-router/SKILL.md](../lightdash-insight-router/SKILL.md)** 及 MCP **`tools/list`** 约定一致。

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

## 过滤与排障（要点）

- 复杂条件：**先单条件**再叠加；空结果时先去掉 `filters` 验链路。
- **422**：优先当**请求校验失败**，查 payload 类型与枚举，勿先归因权限。
- **`lightdash.user.email`**：默认用当前 PAT 对应邮箱；未验证可能被后端置空。

更多步骤见 **[`QUERY-CHECKLIST.md`](./QUERY-CHECKLIST.md)**。
