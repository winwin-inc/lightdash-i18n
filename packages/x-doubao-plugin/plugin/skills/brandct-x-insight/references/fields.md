# X 平台字段与取数速查

## 三层结构

```text
项目(project) → explore(表) → dimension(维度) + metric(指标)
```

- `exploreName`：表名，`list_explores` / `find_explores` 返回
- `fieldId`：字段 ID，形如 `<explore>_<字段>`，`find_fields` 返回
- dimension 进 `dimensions[]`，metric 进 `metrics[]`，**不要混**

## 必读顺序（省调用次数）

1. `get_my_access` —— 令牌、项目、可见范围（1 次）
2. `list_explores` —— 有哪些表（1 次，带 search 过滤）
3. `find_fields` —— 目标表的字段（**每张要用的表各 1 次**，不要重复查同一张）
4. `run_metric_query` —— 取数（**合并参数，尽量 1 次**）

## `run_metric_query` 常用参数

| 参数 | 说明 |
|---|---|
| `exploreName` | 必填，表名 |
| `dimensions` | 维度 fieldId 数组 |
| `metrics` | 指标 fieldId 数组 |
| `filters` | `{ dimensions: { and: [{ target: { fieldId }, operator, values }] } }` |
| `sorts` | 排序数组 |
| `limit` | 明细条数，默认不传 |

## 常见坑

1. **fieldId 拼错不报“字段不存在”，而是 422 或空结果** —— 先用 `find_fields` 取准确 ID。
2. **同一 explore 的多个指标应合并成一次查询**，分成多次会重复扫全表，慢且贵。
3. **跨 explore 不能 JOIN** —— 需要在 explore 内选已建模好的指标，或分别取数后在结论层面对比。
4. **时间范围用 filters 传，不要靠 limit 截断**。
5. **维度表不要单独查指标**，只用于补展示名称。

## 输出前自检

- [ ] 每个数字都能对应到某次 `run_metric_query` 的返回
- [ ] 时间范围已写进结论
- [ ] fieldId 用的是 `find_fields` 返回的原值，不是自己拼的
- [ ] 没有把不同口径的指标直接相加
