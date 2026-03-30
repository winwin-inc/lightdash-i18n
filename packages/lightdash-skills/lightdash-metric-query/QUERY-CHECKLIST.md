# Metric Query Checklist（就地版）

## 必须满足

- 用扁平参数，不要嵌套 `query`
- `filters` 必须是对象（map），不要数组旧格式
- `parameters` 必须是对象（`{}`），不要传字符串 `"{}"`
- `context` 仅允许 Lightdash 枚举值（如 `mcp`），不要传业务中文描述

## 构造顺序

1. `exploreName`
2. `dimensions` / `metrics`
3. `filters`
4. `sorts`
5. `limit`
6. 可选 `tableCalculations` / `customDimensions` / `timezone`

## 排障顺序

1. `fieldId` 是否真实存在（先 `get_explore`）
2. `exploreName` 是否正确
3. 请求体类型是否正确（尤其 `parameters` / `filters` / `context`）
4. 运算符与字段类型是否匹配
5. `limit` / `sorts` 是否过大
6. 是否需要时区对齐
7. 含 `lightdash.user.email` 过滤时，确认 token 对应用户邮箱已验证

