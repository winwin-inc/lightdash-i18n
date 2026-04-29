# @lightdash/skills

给 Claude Code 使用的 Lightdash 技能包（SKILL 文档集合）。

## 目录结构建议（已按此组织）

```text
packages/lightdash-skills/
  .claude/settings.json
  .mcp.json.example
  README.md
  lightdash-insight-router/SKILL.md
  lightdash-metric-query/SKILL.md
```

结论：**不需要再额外套一层 `skills/` 子目录**。  
只要每个技能目录内有 `SKILL.md`，并且项目根有 `.claude` / `.mcp.json` 配置，Claude 就能稳定理解与调用。

## 与 MCP 的关系

- Skills 只负责「如何提问与调用流程」，不直接连服务。
- 真正请求由 MCP 客户端发起（Claude Code / Cursor）。
- 推荐对外分发用 HTTP MCP（客户端只配 `url` + `headers`）。

配置模板见：[`.mcp.json.example`](./.mcp.json.example)  
完整说明见：[`docs/lightdash-mcp.md`](../../docs/lightdash-mcp.md)  
**工具名**以 monorepo 内 [`packages/lightdash-mcp/README.md`](../lightdash-mcp/README.md) 及 `packages/lightdash-mcp/src/mcp/**` 注册为准（本技能包已按当前实现使用 `find_content`、`lightdash_*` 扩展名等，不再写已移除的别名）。

## Claude 授权（避免反复弹窗）

本包内已提供 [`./.claude/settings.json`](./.claude/settings.json)：

- `enableAllProjectMcpServers: true`
- `permissions.allow: ["mcp__lightdash__*"]`

这表示：自动启用 `.mcp.json` 中的 lightdash 服务，并默认允许该服务全部 tools。

## 当前技能

- `lightdash-insight-router`：唯一入口（精简版：分支、工具顺序、硬规则、类目要点）；**完整流程与门禁**见仓库 [`docs/mcp/lightdash-mcp-query-sop.md`](../../docs/mcp/lightdash-mcp-query-sop.md)。
- `lightdash-metric-query`：高级 `run_metric_query` 形状与排障（与 router 互补，避免重复长文）

## 使用约定

- 提数优先使用 `packages/lightdash-mcp` 暴露的工具：标准 16 个（如 `find_content`、`run_metric_query`）+ 4 个 `lightdash_*` 扩展（如 `lightdash_get_site_info`、`lightdash_get_saved_chart`）；内容类结果中的 `webUrl` 以工具返回值为准
- 不在技能正文写明文密钥
- 能先跑保存图表就先跑保存图表；需要自定义再走 explore + metric query
