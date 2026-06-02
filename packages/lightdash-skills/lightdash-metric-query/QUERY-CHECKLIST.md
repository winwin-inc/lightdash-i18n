# Metric Query Checklist

## 选工具

1. 有 Explorer 复制的整段 JSON 或 `filters.dimensions.and` 多条件 → **`run_semantic_metric_query`** + `metricQuery`
2. 仅简单 explore + 少量字段 → **`run_metric_query`** 扁平

## 语义 query（run_semantic_metric_query）

- 只传 `metricQuery`（对象）；`dimensions`/`metrics` 为字符串数组
- 可省略空 `tableCalculations`/`additionalMetrics`/`customDimensions`/`metricOverrides`
- 422：修改 `metricQuery` 后重试

## 扁平 query（run_metric_query）

- `exploreName` → `dimensions` / `metrics` → `filters` → `sorts` → `limit`
- `filters` 对象（map），禁止数组旧格式
- `parameters` 为 `{}`；`context` 仅枚举（如 `mcp`）

## 排障顺序

1. `fieldId` / `exploreName`（`find_fields`、`list_explores`）
2. 是否用错工具（整段 JSON 必须用语义工具）
3. 请求体类型（`parameters` / `filters` / `context`）
4. 运算符与字段类型、枚举 values 是否存在
5. `limit` / `sorts`；`lightdash.user.email` 与 PAT 邮箱是否已验证
