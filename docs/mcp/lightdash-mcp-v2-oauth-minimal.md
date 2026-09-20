# Lightdash MCP v2 OAuth 最小配置

目标：预发环境优先支持 **Claude Code** 和 **WorkBuddy** 通过 Keycloak OAuth 连接 Lightdash MCP v2。Cursor 为可选支持。

固定地址：

```text
MCP：https://mcp-x.pre.banmahui.cn/mcp
Keycloak Realm：https://keycloak.dev.banmahui.cn/realms/mcp
OAuth Audience：https://mcp-x.pre.banmahui.cn/mcp
```

## 一、Keycloak 运维配置

### 1. 开启动态客户端注册

在 realm `mcp` 的 Anonymous Client Registration 中确认：

```text
允许匿名注册：是
Client type：Public
Standard Flow：ON
Client authentication：OFF
PKCE：S256
Host Sending Client Registration Request Must Match：OFF
Client URIs Must Match：ON
Allowed Client Scopes：openid、email、mcp:read
```

如客户端需要刷新令牌，可额外允许 `offline_access`。

### 2. 放行回调地址

Claude Code 常见回调：

```text
http://localhost:{动态端口}/callback
http://127.0.0.1:{动态端口}/callback
```

至少放行：

```text
localhost
127.0.0.1
```

WorkBuddy 首选回调（`lightdash-mcp` 为连接器 source）：

```text
workbuddy://workbuddy/mcp/connector%3Alightdash-mcp/oauth/callback
```

WorkBuddy 回退回调：

```text
http://127.0.0.1:{动态端口}/oauth/callback
```

至少放行：

```text
workbuddy
localhost
127.0.0.1
```

Keycloak 会校验一次 DCR 请求中的全部 `redirect_uris`。若仍报 `Trusted Hosts`，以 Keycloak 日志记录的实际完整 URI 列表为准补齐，不能只放行其中一个。

### 3. 配置 Scope 和 Token Claims

创建或确认 Client Scope `mcp:read`，并允许 Anonymous DCR 客户端申请。

在 `mcp:read` 中添加 Audience Mapper：

```text
Mapper Type：Audience
Included Custom Audience：https://mcp-x.pre.banmahui.cn/mcp
Add to access token：ON
```

确认 `email` Client Scope 会将用户邮箱写入 access token：

```text
User Property：email
Token Claim Name：email
Add to access token：ON
```

用户还必须在预发 Lightdash 中存在同邮箱账号。

预期 access token 至少包含：

```json
{
  "aud": "https://mcp-x.pre.banmahui.cn/mcp",
  "scope": "openid email mcp:read",
  "email": "user@example.com"
}
```

## 二、预发 MCP 配置

`lightdash-mcp-config`：

```yaml
KEYCLOAK_REALM_URL: 'https://keycloak.dev.banmahui.cn/realms/mcp'
MCP_PUBLIC_URL: 'https://mcp-x.pre.banmahui.cn'
MCP_OAUTH_AUDIENCE: 'https://mcp-x.pre.banmahui.cn/mcp'
OAUTH_REQUIRED_SCOPES: 'openid,email,mcp:read'
```

应用 ConfigMap 后必须重建 MCP Pod。无需新增 Secret；MCP 与 Lightdash Backend 已有的 `LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET` 必须保持一致。

## 三、客户端接入

### Claude Code

```text
claude mcp add --transport http --scope local msyx-pre https://mcp-x.pre.banmahui.cn/mcp
```

然后在 Claude Code 中执行 `/mcp`，选择 `msyx-pre` 并完成 Keycloak 登录。

### WorkBuddy

`mcp.json`：

```json
{
  "mcpServers": {
    "lightdash-mcp": {
      "type": "streamableHttp",
      "url": "https://mcp-x.pre.banmahui.cn/mcp",
      "timeout": 30000
    }
  }
}
```

`connector-meta.json` 的 `source` 使用：

```json
{
  "name": "Lightdash MCP",
  "source": "lightdash-mcp",
  "type": "mcp",
  "version": "1.0.0"
}
```

不要配置长期 Token，用户安装连接器后通过浏览器完成 Keycloak 登录。

## 四、最小验收

依次确认：

1. `GET https://mcp-x.pre.banmahui.cn/health` 返回 `ok: true`。
2. `GET https://mcp-x.pre.banmahui.cn/.well-known/oauth-protected-resource` 返回 OAuth metadata。
3. Keycloak OIDC metadata 的 `scopes_supported` 包含 `mcp:read`。
4. Claude Code 能弹出登录页，登录后能列出 MCP 工具。
5. WorkBuddy 能弹出登录页，登录后能调用 MCP 工具。

任一步失败时优先查看 Keycloak 日志中的 DCR `redirect_uris`、scope 和 token claims。

## 五、Cursor（可选）

需要支持 Cursor 时，再根据 Keycloak 日志放行它一次 DCR 中提交的全部回调。常见值：

```text
http://localhost:8787/callback
https://www.cursor.com/agents/mcp/oauth/callback
cursor://anysphere.cursor-mcp/oauth/callback
```

Cursor 不影响 Claude Code 和 WorkBuddy 的上线验收。
