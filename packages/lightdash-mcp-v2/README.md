# @lightdash/mcp-v2

> **最新完整说明**：[docs/mcp/lightdash-mcp-v2.md](../../docs/mcp/lightdash-mcp-v2.md)

Lightdash MCP HTTP 服务（**MCP 协议 2026-07-28 sessionless**，`legacy:stateless`）。

与 `@lightdash/mcp`（v1）并行存在，互不影响。

## 差异（相对 v1）

- `createMcpHandler(..., { legacy: 'stateless' })`：无状态兼容旧流量；服务端不保存 Session / 当前项目
- **无** Session Registry / 业务态 `Mcp-Session-Id` 记忆 / GET SSE Session / DELETE Session
- **无** `set_project` / `get_current_project` / `mcpSessionStore`
- 项目解析：`工具参数 projectUuid` → `LIGHTDASH_PROJECT_UUID`
- 查数分页：`limit` + `offset`（建议稳定 sorts）；目录/内容：`page` + `pageSize`

## 启动

```bash
pnpm -F @lightdash/mcp-v2 build
pnpm -F @lightdash/mcp-v2 start:http
```

环境变量见 `.env.example`。默认端口 `LIGHTDASH_MCP_HTTP_PORT`（3333）。
