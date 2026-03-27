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

## Claude 授权（避免反复弹窗）

本包内已提供 [`./.claude/settings.json`](./.claude/settings.json)：

- `enableAllProjectMcpServers: true`
- `permissions.allow: ["mcp__lightdash__*"]`

这表示：自动启用 `.mcp.json` 中的 lightdash 服务，并默认允许该服务全部 tools。

## 当前技能

- `lightdash-insight-router`：唯一入口路由（保存图表 / 维度指标 / SQL查表三分支）
- `lightdash-metric-query`：高级 metric query 规则与排障（由 router 在高级场景触发）

## 使用约定

- 提数优先使用 `packages/lightdash-mcp` 暴露的业务向 tools
- 不在技能正文写明文密钥
- 能先跑保存图表就先跑保存图表；需要自定义再走 explore + metric query
