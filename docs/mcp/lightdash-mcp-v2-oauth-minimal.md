# Lightdash MCP v2 OAuth 最小配置（预发实操）

目标：预发优先支持 **Claude Code**、**WorkBuddy**；Cursor 选配。  
本文按预发已跑通路径整理，可直接转发运维 / 接入方。

固定地址：

```text
MCP：https://mcp-x.pre.banmahui.cn/mcp
Keycloak Realm：https://keycloak.dev.banmahui.cn/realms/mcp（Winwin MCP Realm）
OAuth Audience：https://mcp-x.pre.banmahui.cn/mcp
```

---

## 一、Keycloak 配置（按界面路径）

进入 Keycloak 管理台 → 选择 realm **`mcp`**。

### 1. 创建 Client Scope：`mcp:read`

路径：**Client scopes** → **Create client scope**

| 字段 | 值 |
|------|------|
| Name | `mcp:read` |
| Description | `Lightdash MCP read access`（可选） |
| Type | `Optional` |
| Protocol | `OpenID Connect` |
| Display on consent screen | On |
| Include in token scope | **On** |
| Include in OpenID Provider Metadata | On |

Save。

### 2. 给 `mcp:read` 加 Audience Mapper

路径：刚创建的 `mcp:read` → **Mappers** → **Configure a new mapper** → 选 **Audience**

| 字段 | 值 |
|------|------|
| Name | `mcp-audience` |
| Included Custom Audience | `https://mcp-x.pre.banmahui.cn/mcp` |
| Add to ID token | Off |
| Add to access token | **On** |

Save。

确认 `email` scope 会把用户邮箱写入 access token（User Property `email` → claim `email`，Add to access token On）。

自检：

```text
https://keycloak.dev.banmahui.cn/realms/mcp/.well-known/openid-configuration
```

`scopes_supported` 必须出现 **`mcp:read`**。

### 3. Trusted Hosts（回调白名单，含 WorkBuddy / Cursor）

路径：**Clients** → **Client registration** → **Anonymous access policies** → **Trusted Hosts**

要同时支持 Claude Code + WorkBuddy + Cursor，Trusted Hosts **建议一次配齐**：

```text
localhost
127.0.0.1
workbuddy
www.cursor.com
cursor.com
anysphere.cursor-mcp
```

其它开关：

```text
Host Sending Client Registration Request Must Match：OFF
Client URIs Must Match：ON
```

说明：

- `mcp:read` **不要**写进 Trusted Hosts；那里只放域名/主机名/自定义 scheme 主机段。
- 若仍报 `Trusted Hosts` / `URI doesn't match`，以 Keycloak 日志里本次 DCR 的完整 `redirect_uris` 为准补齐，不能只放行其中一个。

各客户端实际回调形态：

| 客户端 | 典型 redirect_uris | Trusted Hosts 对应项 |
|--------|--------------------|----------------------|
| Claude Code | `http://localhost:{端口}/callback`、`http://127.0.0.1:{端口}/callback` | `localhost`、`127.0.0.1` |
| WorkBuddy | `workbuddy://workbuddy/mcp/connector%3Alightdash-mcp/oauth/callback`；回退 `http://127.0.0.1:{端口}/oauth/callback` | `workbuddy`、`127.0.0.1`、`localhost` |
| Cursor | `http://localhost:8787/callback`、`https://www.cursor.com/agents/mcp/oauth/callback`、`cursor://anysphere.cursor-mcp/oauth/callback` | `localhost`、`www.cursor.com`、`cursor.com`、`anysphere.cursor-mcp` |

Claude / Cursor 回调到 `localhost` 是正常行为（本机收授权码），不是连错 MCP。

### 4. Allowed Client Scopes（可选但建议补齐）

路径：**Clients** → **Client registration** → **Anonymous access policies** → **Create client policy**  
Provider 选：**`allowed-client-templates`**

| 字段 | 值 |
|------|------|
| Name | `Allowed Client Scopes` |
| Allowed Client Scopes | 见下方完整列表 |
| Allow Default Scopes | On |

白名单必须一次勾全（Claude 实际会申请这些）：

```text
openid
email
offline_access
mcp:read
profile
```

Save。

#### 预发踩坑说明

- 若白名单不全，Claude Authenticate 会报：  
  `Policy 'Allowed Client Scopes' rejected request... Not permitted to use specified clientScope`
- 临时处理：删掉该策略即可登录（预发曾因此删掉后跑通）。
- **建议**：按上面 5 个 scope 重建策略，再让 Claude 重新 Authenticate 回归一次。
- 只勾 `mcp:read`、或漏 `offline_access` / `profile`，都会再次失败。

当前若策略仍为空：功能可用，但 DCR 没有 scope 白名单约束；上线前建议按上表加回。

---

## 二、预发 MCP（K8s）

ConfigMap `lightdash-mcp-config`（namespace `pre`）：

```yaml
KEYCLOAK_REALM_URL: 'https://keycloak.dev.banmahui.cn/realms/mcp'
MCP_PUBLIC_URL: 'https://mcp-x.pre.banmahui.cn'
MCP_OAUTH_AUDIENCE: 'https://mcp-x.pre.banmahui.cn/mcp'
OAUTH_REQUIRED_SCOPES: 'openid,email,mcp:read'
```

注意：

1. apply ConfigMap 后必须重建 MCP Pod。
2. 无需新增 Secret；与 Lightdash Backend 共用 `LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET`。
3. MCP 镜像需提供根路径 `/.well-known/oauth-protected-resource`（WorkBuddy 兼容）。

---

## 三、账号要求（换票）

MCP 用 Keycloak JWT 中的 `email` 向 Lightdash 调 `/api/v1/mcp/token-exchange`。

必须同时满足：

1. Keycloak 登录用户已填正确 Email。
2. 预发 Lightdash 存在**同邮箱**主账号。
3. 该 Lightdash 邮箱可用（勿卡在「更换邮箱 / 待验证」且收不到验证码）。

常见失败：

| 现象 | 原因 |
|------|------|
| `No Lightdash user with primary email: xxx` | Keycloak 邮箱在 Lightdash 不存在 |
| token-exchange 200，工具可用 | 邮箱匹配成功 |

误改 Lightdash 邮箱且收不到验证码时：界面无法「标记已验证」，需在库表 `emails` 改回可用邮箱并设 `is_verified = true`（相关 OTP 在 `email_one_time_passcodes`）。

---

## 四、客户端接入

### Claude Code

在项目目录（示例）：

```text
d:\workspace_company\lightdash-i18n
```

```text
claude mcp add --transport http --scope local msyx-pre https://mcp-x.pre.banmahui.cn/mcp
```

会话中 `/mcp` → 选 `msyx-pre` → Authenticate → Keycloak 登录。  
成功后应为 `connected`，并可列出工具（预发实测约 23 个；`list_projects` 已跑通）。

### WorkBuddy

Keycloak 侧：Trusted Hosts 已含 `workbuddy`（及 `localhost` / `127.0.0.1`）。

客户端侧 `mcp.json`：

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

`connector-meta.json`：

```json
{
  "name": "Lightdash MCP",
  "source": "lightdash-mcp",
  "type": "mcp",
  "version": "1.0.0"
}
```

注意：

1. **不要**填长期 Token；走标准 MCP OAuth。
2. `source` 必须与回调 URI 中 `connector%3A<source>` 一致（上例为 `lightdash-mcp`）。
3. 安装连接器后点「连接」，浏览器完成 Keycloak 登录。

### Cursor

Keycloak 侧：Trusted Hosts 已含 `localhost`、`www.cursor.com`、`cursor.com`、`anysphere.cursor-mcp`。

客户端侧 `.mcp.json` / Cursor MCP 配置：

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

在 Cursor 里对该 MCP 做 OAuth 登录。若仍 `Trusted Hosts` 失败，把 Output 里完整错误和 Keycloak 日志中的 `redirect_uris` 补进 Trusted Hosts。

---

## 五、验收清单

1. `GET https://mcp-x.pre.banmahui.cn/health` → `ok: true`
2. `GET https://mcp-x.pre.banmahui.cn/.well-known/oauth-protected-resource` → 含 `authorization_servers`
3. Keycloak `scopes_supported` 含 `mcp:read`
4. Claude DCR 成功，浏览器出现 Keycloak 登录页，回调 `localhost` 正常
5. Lightdash 日志 `POST /api/v1/mcp/token-exchange` → **200**
6. Claude `/mcp` 显示 `msyx-pre` **connected**，能调用如 `list_projects`

---

## 六、配置顺序（推荐）

1. Keycloak：`mcp:read` + Audience Mapper + Trusted Hosts  
2. （建议）Allowed Client Scopes 勾全 5 项  
3. 应用 MCP ConfigMap 并重建 Pod  
4. 确认 Lightdash / Keycloak 同邮箱账号  
5. Claude Code Authenticate + 调工具  
6. （可选）补 WorkBuddy / Cursor 回调  

---

## 七、常见错误速查

| 现象 | 处理 |
|------|------|
| `Invalid scopes: ... mcp:read` | 创建 `mcp:read` 并出现在 `scopes_supported` |
| `Trusted Hosts` / URI doesn't match | 按客户端补 Hosts；看拒绝日志中的完整 `redirect_uris` |
| `Allowed Client Scopes` rejected | 白名单补全 5 项，或临时删策略 |
| token-exchange 404 无用户 | Keycloak / Lightdash 邮箱不一致 |
| 一直停在 Lightdash 邮箱验证页 | 会话未退出 + 邮箱改错；logout URL 或改 `emails` 表 |
| 回调到 localhost | **正常**，本机 Claude 收授权码 |

*文档版本：2026-09-20 · 基于预发 Claude Code 实跑通整理*
