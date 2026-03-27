---
name: lightdash-data-tools
description: 用于 Lightdash 即席分析。用户明确要构造 metric query、自选维度/指标、临时拉数、复杂筛选时触发。技术导向，非业务内容浏览。
---

# Lightdash Data Tools（技术向）

## 何时使用

- 用户要查看项目下有哪些 **Explore（数据表/模型）** 可用于自助分析
- 用户要查看某个 Explore 的可用字段（维度、指标）
- 用户要**自选字段**构造 metric query（临时分析，非已保存图表）
- 用户需要自定义筛选、排序、表计算等高级查询

## 与 lightdash-insight-router 的区别

| 场景 | 使用技能 |
|------|----------|
| 有哪些图表/看板、搜"XX" | `lightdash-insight-router` |
| 运行已保存的图表 | `lightdash-insight-router` |
| 有哪些 Explore 能查 | `lightdash-data-tools` |
| 自选字段做即席分析 | `lightdash-data-tools` |

## 标准流程

1. 先调用 `lightdash_list_explores`（必要时 `filtered=true`）
2. 再调用 `lightdash_get_explore` 确认字段 ID
3. 最后调用 `lightdash_run_metric_query`

## 关键规则

- **不要猜字段名**：`fieldId` 必须来自 `lightdash_get_explore` 返回结果
- `projectUuid` 优先显式传；若省略，依赖 `LIGHTDASH_DEFAULT_PROJECT_UUID`
- 大结果优先缩小维度、limit、过滤条件，而不是无限增大 `pageSize`
- PAT 仅来自环境变量，不在对话中输出或回显

## metric query 输入建议

- `query` 至少包含：
  - `exploreName`（string）
- 常用字段：
  - `dimensions: string[]`
  - `metrics: string[]`
  - `filters: object`
  - `sorts: Array<{ fieldId: string; descending: boolean }>`
  - `limit: number`
  - `tableCalculations: []`

## 参考文档

- [quickstart.md](./quickstart.md)：5 步上手
- [examples.md](./examples.md)：list / get explore / run query 最短可复制示例
- [examples-advanced.md](./examples-advanced.md)：自定义维度、时区、表计算等

## 常见错误与处理

- 401/403：检查 `LIGHTDASH_API_KEY` 权限与组织/项目可见性
- explore 不存在：先 `lightdash_list_explores` 再校验 `exploreId`
- query timeout：减少字段数量、减小 `limit`、增加筛选条件、适当调大轮询参数
