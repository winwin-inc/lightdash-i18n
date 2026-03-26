# Project Guidance (Lightdash MCP + Skills)

## Data Query Priority

- 在本仓库做 Lightdash 提数时，优先使用 `packages/lightdash-mcp` 的 MCP tools
- 推荐顺序：
  1. `lightdash_list_explores`
  2. `lightdash_get_explore`
  3. `lightdash_run_metric_query`

## Query Safety

- 不要凭空猜测 `fieldId`，必须以 explore 元数据为准
- 优先小结果验证，再逐步扩大 query 范围
- 避免在输出中泄露 `LIGHTDASH_API_KEY`

## Skills Location

- 项目技能在 `skills/` 目录
- 路由技能：`skills/lightdash-data-tools/SKILL.md`
- query 技能：`skills/lightdash-metric-query/SKILL.md`
