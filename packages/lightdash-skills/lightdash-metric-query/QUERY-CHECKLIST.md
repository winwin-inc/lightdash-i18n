# Metric Query Checklist

## 必须满足

- 扁平参数，禁止嵌套 `query`；`filters` 对象（map），禁止数组旧格式；`parameters` 为 `{}`，禁止字符串 `"{}"`；`context` 仅允许枚举（如 `mcp`），禁止业务中文描述。

## 构造顺序

`exploreName` → `dimensions` / `metrics` → `filters` → `sorts` → `limit` → 可选 `tableCalculations` / `customDimensions` / `timezone`。

## 排障顺序

1. `fieldId` 是否存在（`find_fields`、`list_explores` 或缩小 `limit` 试跑）。
2. `exploreName` 是否正确。
3. 请求体类型（`parameters` / `filters` / `context`）。
4. 运算符与字段类型是否匹配。
5. `limit` / `sorts` 是否过大；是否需时区对齐。
6. 含 `lightdash.user.email` 时，token 对应邮箱是否已验证。
