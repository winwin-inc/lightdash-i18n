# Lightdash Skills

本目录存放给 Claude Code 使用的项目内 Skills。

## 当前技能

- `lightdash-data-tools`：路由技能，指导何时使用 `lightdash_list_explores` / `lightdash_get_explore` / `lightdash_run_metric_query`
- `lightdash-metric-query`：补充 Metric Query 组装规范（字段、filters、默认值与排障）

## 使用约定

- 提数优先走 `packages/lightdash-mcp` 提供的 MCP tools
- 不在对话或技能正文中粘贴 `LIGHTDASH_API_KEY`
- 先获取 explore 字段，再构造 query，避免 `fieldId` 误拼
