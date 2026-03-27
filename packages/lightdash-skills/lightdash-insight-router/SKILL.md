---
name: lightdash-insight-router
description: 用于 Lightdash 业务场景路由。用户提到看板、图表、报表、空间、搜索内容、运行保存的图表时触发。根据用户意图选择合适的工具。
---

# Lightdash Insight Router

## 何时使用

- 用户要查看**看板、图表、报表、空间**（内容资产）
- 用户要**搜索**某个关键词相关的图表或看板
- 用户要**运行已保存的图表**（如"去年营收趋势那张图"）
- 用户要查看有哪些**数据表/模型**可以自助分析（Explore 技术名）

## 路由规则

| 用户说法 | 工具走向 |
|----------|----------|
| 有哪些看板/图表/报表/空间、搜「XX」 | → `lightdash_search_content` |
| 跑**保存的**某张图、去年/本月的「XX图表」 | → `lightdash_run_saved_chart`（需先 search_content 获取 chartUuid） |
| 有哪些**表/模型**能查、Explore 列表 | → `lightdash_list_explores` |
| 某 explore 下有哪些字段 | → `lightdash_get_explore` |
| 自己选字段做分析、临时拉数、复杂筛选 | → `lightdash_run_metric_query` |
| 不知道有哪些项目 | → `lightdash_list_projects` |

## 标准流程

### 场景 1：查找和浏览图表/看板

1. 调用 `lightdash_search_content`：
   - `search`: 关键词（如"销售"）
   - `contentTypes`: ["chart", "dashboard", "space"]
   - `projectUuid`: 项目 UUID
2. 返回后用自然语言总结列表

### 场景 2：运行已保存的图表

1. 若已知图表名：先 `lightdash_search_content` 搜索获取 `chartUuid`
2. 调用 `lightdash_run_saved_chart`：
   - `chartUuid`: 必填
   - `parameters`: 可选，覆盖图表预设参数
   - `limit`: 可选，默认 500
3. 若需要自定义参数/筛选：退回 `lightdash_get_explore` + `lightdash_run_metric_query`

### 场景 3：即席分析（自选字段）

1. `lightdash_list_explores` 列出可用数据主题
2. `lightdash_get_explore` 查看字段详情
3. `lightdash_run_metric_query` 构造查询

## 关键规则

- **先对齐意图再取数**：缺少年份、项目、图表名时，先列选项或反问
- `chartUuid` 不能猜：必须通过 `lightdash_search_content` 或用户指定获取
- 区分**业务内容**（图表/看板）与**技术 Explore**（dbt 模型）
- 参数解析：把「2024 年」「本月」翻译成 `parameters` 或 `filters`

## 示例对话

### Q: "我们有哪些和销售相关的图表？"

1. `lightdash_search_content({ search: "销售", contentTypes: ["chart"] })`
2. 返回图表列表，用自然语言总结

### Q: "跑一下「营收趋势」去年的数据"

1. `lightdash_search_content({ search: "营收趋势", contentTypes: ["chart"] })` → 获取 chartUuid
2. `lightdash_run_saved_chart({ chartUuid: "xxx", parameters: { year: 2024 } })`
3. 返回数据结果

### Q: "这个项目里有哪些数据表可以查？"

1. `lightdash_list_explores({ filtered: true })`
2. 用业务语言解释 explore 名称

## 参考文档

- [lightdash-mcp.md](../../docs/lightdash-mcp.md)：MCP 工具完整列表
- [lightdash-data-tools/SKILL.md](../lightdash-data-tools/SKILL.md)：即席分析技能
