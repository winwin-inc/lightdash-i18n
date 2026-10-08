# @lightdash/mcp-v2

> **最新完整说明**：[docs/mcp/lightdash-mcp-v2.md](../../docs/mcp/lightdash-mcp-v2.md)  
> **鉴权专题**：[docs/mcp/lightdash-mcp-v2-keycloak-oauth.md](../../docs/mcp/lightdash-mcp-v2-keycloak-oauth.md)

Lightdash MCP HTTP 服务（**MCP 协议 2026-07-28 sessionless**，`legacy:stateless`）。

与 `@lightdash/mcp`（v1）并行存在，互不影响。

## 客户端接入

只配 MCP URL，走 Keycloak OAuth。**不要**在 `.mcp.json` / `headers` 里配 `x-api-key` 或长期 PAT。详见 [MCP v2 说明 · 快速接入](../../docs/mcp/lightdash-mcp-v2.md#2-快速接入)。

## 差异（相对 v1）

- `createMcpHandler(..., { legacy: 'stateless' })`：无状态兼容旧流量；服务端不保存 Session / 当前项目
- **无** Session Registry / 业务态 `Mcp-Session-Id` 记忆 / GET SSE Session / DELETE Session
- **无** `set_project` / `get_current_project` / `mcpSessionStore`
- 项目解析：`工具参数 projectUuid` → `LIGHTDASH_PROJECT_UUID`
- 查数分页：`limit` + `offset`（建议稳定 sorts）；目录/内容：`page` + `pageSize`
- **鉴权**：Keycloak OAuth（JWKS）→ 按 JWT email 向后端换短期 PAT → 下游 REST 用 `ApiKey`（客户端不再配 `x-api-key`）

## 启动

```bash
pnpm -F @lightdash/mcp-v2 build
pnpm -F @lightdash/mcp-v2 start:http
```

环境变量见 `.env.example`（必填：`LIGHTDASH_SITE_URL`、`KEYCLOAK_REALM_URL`、`MCP_PUBLIC_URL`、`LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET`）。默认端口 `LIGHTDASH_MCP_HTTP_PORT`（3333）。

Backend 需配置同名换票密钥，以及可选的 `LIGHTDASH_MCP_PAT_TTL_SECONDS`（默认 3600）。
