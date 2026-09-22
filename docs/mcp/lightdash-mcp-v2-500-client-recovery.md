# MCP v2：扫码成功后 POST /mcp 报 500

客户端只配 URL、扫码登录后仍出现：

```text
streamableHttp connect failed: ... POSTing to endpoint:
{"error":"server_error","error_description":"Internal Server Error"}
sse connect failed: SSE error: Non-200 status code (500)
```

本文说明客户怎么配、服务端改了什么、运维如何验收。不是「把 API Key 去掉就能好」。

相关：[v2 说明](./lightdash-mcp-v2.md) · [Keycloak OAuth](./lightdash-mcp-v2-keycloak-oauth.md) · [OAuth 最小配置](./lightdash-mcp-v2-oauth-minimal.md)

---

## 1. 原因（给研发 / 运维）

v2 不走客户端 API Key。`requireBearerAuth` 先看 `Authorization` 头：

| Authorization | 旧行为 | 现行为 |
|---|---|---|
| 缺失 / `Bearer` 空值 / `Basic` | 401 `invalid_token` | 不变 |
| `Bearer <非空>` 但 JWT 非法、过期、aud/scope/email 不对 | **500 `server_error`** | **401 `invalid_token`** |
| JWKS 拉取失败 / Keycloak 不可达 | 500 | 仍 500 `server_error`（真故障，不伪装成 token 无效） |

旧代码在 [`keycloakJwt.ts`](../../packages/lightdash-mcp-v2/src/http/keycloakJwt.ts) 验签失败时抛普通 `Error`。SDK 只把 `OAuthError` 收成 401，其余打成 `{"error":"server_error","error_description":"Internal Server Error"}`。客户端会当成服务挂了，不会重新授权。

不是 introspection，也不是历史 `x-api-key`。探测带 `X-API-Key` 只会变成「没 Authorization」的 401。

---

## 2. 客户怎么配

**不要**填 API Key / `x-api-key` / 长期 PAT。只写 URL，扫自己的 Keycloak / SSO。

预发马上赢X：

```json
{
  "mcpServers": {
    "msyx-pre": {
      "type": "http",
      "url": "https://mcp-x.pre.banmahui.cn/mcp"
    }
  }
}
```

线上主机：`https://mcp-x.brandct.com/mcp`。内部平台见 [v2 · 快速接入](./lightdash-mcp-v2.md#2-快速接入)。

发版后若仍连过一次：

1. 清掉配置里残留的 API Key。
2. Clear authentication → 重连 → 再扫码。
3. Keycloak 邮箱必须等于该环境 Lightdash **已验证主邮箱**（不会自动建用户）。
4. 成功时应 `connected`，并能调如 `list_projects`。

---

## 3. 服务端改动

[`packages/lightdash-mcp-v2/src/http/keycloakJwt.ts`](../../packages/lightdash-mcp-v2/src/http/keycloakJwt.ts)：

- 验签失败、缺 scope、缺 email → `OAuthError(OAuthErrorCode.InvalidToken)`
- JWKS / Keycloak 出网失败 → `OAuthError(OAuthErrorCode.ServerError)`
- 不接回 introspection，不恢复客户端 API Key

发预发镜像并重建 MCP Pod。

---

## 4. 运维验收

垃圾 token 必须 401，不能再 500：

```bash
curl -i -X POST https://mcp-x.pre.banmahui.cn/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer any-non-empty-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}'
```

期望：HTTP **401** `{"error":"invalid_token",...}`，且带 `WWW-Authenticate`。

再用一个确认邮箱已在预发 Lightdash 的账号：只配 URL → 清认证 → 扫码 → 应能列出工具。

---

## 5. 发版后仍 401 时查什么

假 500 修掉之后，连不上会变成干净的 401。对照：

| 项 | 预发马上赢X |
|---|---|
| Audience | JWT `aud` = `https://mcp-x.pre.banmahui.cn/mcp` |
| Scope | access token 含 `openid`、`email`、`mcp:read` |
| Email | token 有 email，且等于 Lightdash 已验证主邮箱 |
| 元数据（建议） | Keycloak `scopes_supported` 勾上 `mcp:read` 的 Include in OpenID Provider Metadata |
| 换票 | MCP 与 Backend 共用 `LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET` |

Keycloak 界面步骤见 [OAuth 最小配置](./lightdash-mcp-v2-oauth-minimal.md)。

---

## 6. 这版能解决什么

- **能修**：任意 Bearer 进校验就 500；客户端无法按 OAuth 重授权。
- **不能单靠这一处保证人人 connected**：JWT 缺 aud / `mcp:read` / email，或邮箱不在 Lightdash，发版后仍是 401，需对齐 Keycloak 与账号。

*文档版本：2026-09-22*
