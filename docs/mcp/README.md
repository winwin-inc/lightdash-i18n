# Lightdash MCP 文档

**先看这里**

1. **新接入**：读 [MCP v2 说明](./lightdash-mcp-v2.md) + [Keycloak OAuth](./lightdash-mcp-v2-keycloak-oauth.md)。客户端**只配 URL**，浏览器完成 Keycloak OAuth；**不要填 API Key / `x-api-key` / 长期 PAT**。
2. Cursor / Claude 只配独立 MCP 的 `https://mcp-*.…/mcp`，**不要**配主站 `{SITE}/api/v1/mcp`。
3. 仓库里的 [`docs/v2/`](../v2/README.md) 是 **Lightdash 产品 2.x** 升级/发版文档，**与 MCP v2 无关**（只是都叫 v2）。
4. 旧目录 [`docs/lightdash-mcp/`](../lightdash-mcp/README.md) 已收成跳转，勿再当入口。

**域名**：线上 `mcp-x.brandct.com` / `mcp-lightdash.banmahui.cn`；预发 `mcp-x.pre.banmahui.cn` / `mcp-lightdash.pre.banmahui.cn`（详见 [v2 · §2](./lightdash-mcp-v2.md#2-快速接入)）。`-x` = 马上赢X，`-lightdash` = 内部平台。

---

## 交付用哪个包

产品 MCP 只有一条线：独立进程。当前交付是 v2，v1 仅存量。

| 包 | 目录 | 本部署怎么用 |
|----|------|--------------|
| **`@lightdash/mcp-v2`（当前）** | `packages/lightdash-mcp-v2` | **唯一交付入口**：Cursor 等只配 `mcp-*.…/mcp` |
| `@lightdash/mcp`（v1） | `packages/lightdash-mcp` | 存量 Session / `set_project` 客户端；新接入勿用 |

## 不要配进 `.mcp.json`

| 路径 | 是什么 | 说明 |
|------|--------|------|
| `{SITE}/api/v1/mcp` | 主站 EE 内置 MCP 协议端点 | 本部署不交付；勿宣传、勿配置 |
| `POST {SITE}/api/v1/mcp/token-exchange` | 服务间换票 REST | 仅独立 v2 → 后端按 email 换短期 PAT；**不是** MCP 协议 |

主站换票路由**默认挂着**，不靠 `MCP_ENABLED`（该变量只管 EE 内置协议端点）。运维只需配共享密钥 `LIGHTDASH_MCP_TOKEN_EXCHANGE_SECRET`；TTL 已有默认，可不配。详见 [Keycloak · 换票与主站环境变量](./lightdash-mcp-v2-keycloak-oauth.md#3-环境变量)。

---

## 文档索引

### 新接入 / 运维

| 文档 | 给谁 |
|------|------|
| [**MCP v2 说明与使用**](./lightdash-mcp-v2.md) | **当前推荐交付**（接入 → 鉴权/项目 → 工具与查询 → 与 v1 差异 → 运维） |
| [**MCP v2 Keycloak OAuth**](./lightdash-mcp-v2-keycloak-oauth.md) | Keycloak + 邮箱换票（一人一票、TTL、失效续期） |
| [**MCP v2 OAuth 最小配置**](./lightdash-mcp-v2-oauth-minimal.md) | 运维实操：Keycloak + 预发环境变量；客户端只配 URL |
| [**MCP v2 OAuth 客户端接入**](./lightdash-mcp-v2-oauth-clients.md) | Claude Code / WorkBuddy / Cursor 回调与验收 |
| [**MCP v2 运维部署（K8s + Docker 穿透）**](./lightdash-mcp-v2-deploy.md) | ConfigMap / Secret / Apisix、本地穿透 `MCP_PUBLIC_URL` |
| [Docker 部署](./lightdash-mcp-docker-deploy.md) | 镜像与健康检查（Dockerfile 已指向 v2） |
| [v2 包 README](../../packages/lightdash-mcp-v2/README.md) | 包级摘要 |

### 分析师

| 文档 | 给谁 |
|------|------|
| [用户使用说明](./lightdash-mcp-user-guide.md) | 怎么提问 |
| [查询工具速查](./lightdash-mcp-query-tools-quickref.md) | semantic vs flat |
| [Skills](../../packages/lightdash-skills/README.md) | 外挂技能包（`packages/lightdash-skills`） |

### v1 存量（Session / compat）

存量文档仍写客户端 PAT / `x-api-key`。**新接入不要按其中的 API Key 配置**，改走 v2（只配 URL + OAuth）。

| 文档 | 给谁 |
|------|------|
| [外部接入指南](./lightdash-mcp-external-guide.md) | **v1 存量**；可转发旧客户端。新接入勿按其中 PAT 配置 |
| [标准客户端用法](./lightdash-mcp-client-usage.md) | **v1 存量**（Session / compat / `x-api-key`） |
| [Session 生命周期与并发](./lightdash-mcp-session-lifecycle.md) | **v1 存量** Session 实现，开发维护 |
| [v1 包 README](../../packages/lightdash-mcp/README.md) | v1 环境变量与 Session 工具 |

---

**v2 要点**：MCP 2026-07-28 [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)；sessionless + legacy:stateless；无 `set_project`；项目用 `projectUuid` 或 `LIGHTDASH_PROJECT_UUID`；鉴权为 Keycloak OAuth + 邮箱换票短期 PAT；打 `mcp-v*` tag 构建 `@lightdash/mcp-v2` 镜像。

**v1 要点**：标准 Session；存量无 Session 走 compat；可选 `set_project`（独立包 `@lightdash/mcp`，非内置 EE 端点）。
