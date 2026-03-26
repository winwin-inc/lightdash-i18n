---
name: lightdash-data-tools
description: 用于 Lightdash 提数路由。用户提到 Lightdash、explore、metric query、拉数、查字段、按条件过滤时触发。优先调用 lightdash_list_explores、lightdash_get_explore、lightdash_run_metric_query。
---

# Lightdash Data Tools

## 何时使用

- 用户要查看项目下有哪些 explores
- 用户要查看某个 explore 的可用字段（维度、指标）
- 用户要按条件拉取结果数据（metric query）

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

## 常见错误与处理

- 401/403：检查 `LIGHTDASH_API_KEY` 权限与组织/项目可见性
- explore 不存在：先 `lightdash_list_explores` 再校验 `exploreId`
- query timeout：减少字段数量、减小 `limit`、增加筛选条件、适当调大轮询参数
