# Lightdash MCP + Skills

在 Cursor、Claude Code 里连接我们自建的 MCP，然后挂上 Skills 来更顺滑地和 Lightdash 打交道。

具体怎么连、怎么配，看 user-guide；想了解背后的架构、鉴权、工具列表，看 architecture；自己部署 MCP 遇到问题，看 `packages/lightdash-mcp/README.md`。

## 几个基本概念

**MCP** = 编辑器里的工具服务，暴露为一个 HTTP 接口。模型通过它调用 Lightdash 的各种能力。

**Skills** = 放在项目里的 Markdown 文件，告诉模型"遇到这类任务应该先走哪条路"。不是工具，但是能引导工具被正确使用。

## 文件都放在哪

| 东西 | 位置 |
|------|------|
| 对外文档（就是这些） | `docs/lightdash-mcp-skills/` |
| MCP 服务代码 | `packages/lightdash-mcp/` |
| 技能包代码 | `packages/lightdash-skills/`（里面是 `lightdash-insight-router/`、`lightdash-metric-query/` 这些）|

给团队分发时，技能包通常打包成独立文件夹，解压后直接是 `lightdash-insight-router/` 那些，不需要保留 `packages/` 这一层。
