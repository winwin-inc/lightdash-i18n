# 内置 MCP 部署与验收（v2，主站 `/api/v1/mcp`）

> **状态**：已实施（分支 `feat/mcp-unified-backend`，P0–P8 完成；2026-11-10）
> **适用范围**：主站内置 MCP 服务 —— 随 backend 镜像发布，**无独立进程/镜像**。
> v1 独立包（`packages/lightdash-mcp`）的发布见 [独立包上线流程](./mcp-standalone-launch.md)。

---

## 1. 一页结论

**可以上预发。** 最小配置只需要一个环境变量：

```
MCP_ENABLED=true
```

鉴权**二选一即可**（预发快速验证推荐 **PAT**，开箱即用）：

| 方式 | 请求头 | 前置条件 | 适用 |
|---|---|---|---|
| **A. PAT（推荐预发首选）** | `Authorization: ApiKey <PAT>` | 无需额外配置（`DISABLE_PAT` 默认非 `true`，PAT 默认启用；个人设置页生成即可） | curl 验收、脚本、快速联调 |
| **B. 主站 OAuth** | `Authorization: Bearer <access_token>` | 无需额外配置（OAuth server 端点默认可用）；`siteUrl` 必须配置正确 | Claude Desktop / Cursor 等真实 MCP 客户端（DCR 自动发现） |

## 2. 配置清单

| 环境变量 | 必需 | 默认 | 说明 |
|---|---|---|---|
| `MCP_ENABLED` | ✅ | `false` | 总开关。**或** EE `AiCopilot` feature flag 开启也会启用（预发建议直接设 `true`，不依赖 flag） |
| `DISABLE_PAT` | — | 未设（PAT 启用） | 保持不设即可；设 `true` 会关闭 PAT 通道 |
| `MCP_OAUTH_REQUIRED_SCOPES` | — | `mcp:read` | OAuth token 的基础准入 scope，一般不动 |
| `LIGHTDASH_PROJECT_UUID` | — | 未设 | **部署级默认项目**（四级兜底链最后一环）。多租户/预发**建议不设**，靠逐级回落 |
| `siteUrl`（部署配置） | ✅（用 OAuth 时） | — | RFC9728 资源元数据（`/api/v1/oauth/.well-known/oauth-protected-resource`）以它拼 URL，必须准确 |

## 3. 部署形态

- **随主站 backend 镜像发布**：从 `feat/mcp-unified-backend` 构建预发镜像（走主站既有发布通道），**不走**独立包的 `mcp-v*` tag → GitHub Actions → Jenkins 流程。
- **与 v1 独立包并存**：独立包跑在独立域名/Deployment，v2 上线互不影响；退役节奏另见[退役评估](./lightdash-mcp-retirement-evaluation.md)。
- MCP 代码已下沉非 EE 目录，自托管/OSS 环境同样可用，无需 EE license。

## 4. 验收清单（PAT 方式，逐条 curl）

> 前置：`SITE_URL` 指向预发域名；`LDPAT` 为测试账号（如 demo@lightdash.com）的 Personal Access Token。

### 4.1 健康检查（无鉴权）

```bash
curl -s "$SITE_URL/api/v1/mcp/health"
# 期望: {"status":"ok", mcp: {enabled: true, ...stateless 标记}}
```

### 4.2 initialize

```bash
curl -s -X POST "$SITE_URL/api/v1/mcp" \
  -H "Authorization: ApiKey $LDPAT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
# 期望: JSON-RPC result 带 serverInfo / capabilities；无 Mcp-Session-Id 头（无状态）
```

### 4.3 工具清单

```bash
curl -s -X POST "$SITE_URL/api/v1/mcp" \
  -H "Authorization: ApiKey $LDPAT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '[.result.tools[].name] | length'
# 期望: 26
```

### 4.4 工具调用（站点信息 + 项目链路）

```bash
# 无需项目的工具
curl -s -X POST "$SITE_URL/api/v1/mcp" \
  -H "Authorization: ApiKey $LDPAT" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_site_info","arguments":{}}}'

# 项目链路：list → set → get（验证四级兜底与 source 字段）
curl -s -X POST "$SITE_URL/api/v1/mcp" \
  -H "Authorization: ApiKey $LDPAT" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'

curl -s -X POST "$SITE_URL/api/v1/mcp" \
  -H "Authorization: ApiKey $LDPAT" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"set_project","arguments":{"projectUuid":"<上一步的 projectUuid>"}}}'

curl -s -X POST "$SITE_URL/api/v1/mcp" \
  -H "Authorization: ApiKey $LDPAT" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_current_project","arguments":{}}}'
# 期望: 返回 projectUuid/projectName/selectedTags + source:"user_default" + hasUserDefault:true
```

### 4.5 异常路径

```bash
# 错误 token → 401，且响应头带 RFC9728 WWW-Authenticate（resource_metadata 指向 OAuth 发现端点）
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SITE_URL/api/v1/mcp" \
  -H "Authorization: ApiKey bad-token" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
# 期望: 401

# POST 缺 Accept: application/json, text/event-stream → 406
# 未设任何默认项目且不传 projectUuid 调项目类工具 → ForbiddenError，文案以
#   "No default project available. Call set_project to set one, or pass projectUuid explicitly." 开头
```

### 4.6 OAuth 方式（可选，真实客户端验收）

1. MCP 客户端（Claude Desktop / Cursor）填 `https://<预发域名>/api/v1/mcp`；
2. 客户端经 RFC9728 发现 → DCR 注册（`/api/v1/oauth/register`）→ 跳转主站登录（用 Lightdash 任意已配置的登录方式，含 SSO）→ 授权页同意；
3. 换取 token 后调用，行为同上；缺 `mcp:read` scope 的历史 client 会被补齐（迁移 `20261012090000`），新建 client 需勾选 scope。

## 5. 回滚

- **只关 MCP**：设 `MCP_ENABLED=false` 并重启（或回滚 env），MCP 端点整体禁用，主站其他功能不受影响。
- **整镜像回滚**：走主站镜像既有回滚流程；MCP 改动收敛在 `McpService/` + 少量配置，无 DB 破坏性迁移（`mcp_context` 表与 scope 迁移均为增量）。

## 6. 已知边界（不阻塞预发）

- `mcp_tool_call` 埋点的 `projectId` 尚未跟随四级兜底链（经组织级/部署级解析成功的调用埋点 projectId 为空）——见 [归档文档 §5](./mcp-unified-backend-status.md)。
- `OrganizationModel.get()` 附带调色板查询，未设用户默认时每次多 2–3 次轻量查询。
