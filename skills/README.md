# Lightdash Skills

本目录存放给 Claude Code 使用的项目内 Skills（Markdown 规则）。

**与 MCP 的关系**

- **Skills 不会「直连」任何服务**：Markdown 只教模型用哪些 MCP tool；真正发请求的是 **已配置好的 MCP 客户端**（Claude Code / Cursor）去调 tool。
- **HTTP MCP**：独立部署时使用 `type` + `url` + `headers`（例如 `Authorization: ApiKey …`），**没有**本地 `command`/`args`。
- **stdio MCP**：在本仓库内开发时，客户端用 `command` + `args` 启动 `node …/dist/index.js`，这只是**进程启动方式**，不是业务 query 参数。
- **对外的技能包用户**：把 MCP 服务部署在可访问的 URL 上，客户端只配 URL 与鉴权头；Skills 仍只说明「先确保 MCP 已连接」。

**客户端配置模板**：[.mcp.json.example](./.mcp.json.example)（`type: http` + `url` + `headers`，复制到使用技能的项目根）。本仓库内若用 stdio，见仓库根 [.mcp.json.example](../.mcp.json.example) 中的 `lightdash` 段。完整说明见 **[docs/lightdash-mcp.md](../docs/lightdash-mcp.md)**。

## 当前技能

- `lightdash-data-tools`：路由技能，指导何时使用 `lightdash_list_explores` / `lightdash_get_explore` / `lightdash_run_metric_query`
  - 同目录 [quickstart.md](./lightdash-data-tools/quickstart.md) / [examples.md](./lightdash-data-tools/examples.md) / [examples-advanced.md](./lightdash-data-tools/examples-advanced.md)
- `lightdash-metric-query`：补充 Metric Query 组装规范（字段、filters、默认值与排障）

## 使用约定

- 提数优先走 `packages/lightdash-mcp` 提供的 MCP tools
- **不**在对话或技能正文中粘贴 `LIGHTDASH_API_KEY`
- 先获取 explore 字段，再构造 query，避免 `fieldId` 误拼

密钥：`stdio` 用 `.mcp.json` 的 `env` 或 `packages/lightdash-mcp/.env`；`HTTP` 用客户端 `headers`（或服务端 `.env` 默认）；也可每次 tool 传 `apiKey`（见文档）。
