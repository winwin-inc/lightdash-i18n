# @lightdash/mcp-v2

Lightdash MCP HTTP 服务（**MCP 协议 2026-07-28 sessionless**）。

与 `@lightdash/mcp`（v1 Session Streamable HTTP）并行存在，互不影响。

## 差异（相对 v1）

- `createMcpHandler(..., { legacy: 'stateless' })`：只接受 2026-07-28；旧 Session 客户端会被拒绝
- **无** Session Registry / `Mcp-Session-Id` / GET SSE / DELETE
- **无** `set_project` / `get_current_project` / `mcpSessionStore`
- 项目解析：`工具参数 projectUuid` → `LIGHTDASH_PROJECT_UUID`

## 启动

```bash
pnpm -F @lightdash/mcp-v2 build
pnpm -F @lightdash/mcp-v2 start:http
```

环境变量见 `.env.example`。默认端口 `LIGHTDASH_MCP_HTTP_PORT`（3333）。
