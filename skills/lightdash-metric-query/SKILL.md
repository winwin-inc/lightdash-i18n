---
name: lightdash-metric-query
description: 当用户明确要构造或调试 metric query（filters、sorts、customDimensions、timezone）时使用。与 lightdash-data-tools 配合，专注 query 形状和排障。
---

# Lightdash Metric Query

## 目标

帮助用户稳定构造可执行的 `query` 对象，并减少因字段、过滤器形状不匹配导致的失败。

## 构造顺序

1. 确认 `exploreName`
2. 选择 `dimensions` / `metrics`
3. 添加 `filters`
4. 添加 `sorts`
5. 设置 `limit`
6. 可选：`tableCalculations` / `customDimensions` / `timezone`

## 推荐最小模板

```json
{
  "exploreName": "orders",
  "dimensions": [],
  "metrics": [],
  "filters": {},
  "sorts": [],
  "limit": 500,
  "tableCalculations": []
}
```

## 过滤建议

- 过滤器形状要与 Lightdash 后端预期一致
- 复杂条件逐步添加：先单条件确认结果，再叠加 AND/OR
- 当结果为空时先去掉 filters 验证基础查询链路

## 排障优先级

1. 字段 ID 是否真实存在（先查 explore）
2. `exploreName` 是否正确
3. filter 目标字段类型与运算符是否匹配
4. limit/sort 是否过于激进
5. 是否需要 `timezone` 与业务时区对齐
