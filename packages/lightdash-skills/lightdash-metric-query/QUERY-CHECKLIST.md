# Metric Query Checklist（就地版）

## 必须满足

- 用扁平参数，不要嵌套 `query`
- `filters` 必须是对象（map），不要数组旧格式

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
3. 运算符与字段类型是否匹配
4. `limit` / `sorts` 是否过大
5. 是否需要时区对齐

