# Lightdash MCP v2 说明与使用（最新）

**状态（2026-09-16）**：可稳定交付。包名 `@lightdash/mcp-v2`，目录 `packages/lightdash-mcp-v2`（版本以 `package.json` 为准，常见为 `2.1.x`）。

**与 v1 关系**：并行存在，**不是** v1 无感替换。v1 在 `packages/lightdash-mcp`（`@lightdash/mcp`）。本文为当前推荐交付文档。

---

## 1. 这是什么与协议

独立 MCP HTTP 服务，把 Lightdash REST 能力暴露给 Cursor / Claude Code 等 MCP 客户端。

### 1.1 协议与传输

v2 按 **MCP 2026-07-28** 实现，传输为 **Streamable HTTP**：

[https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

### 1.2 一览

| 项 | v2 |
|---|---|
| 包 | `@lightdash/mcp-v2` |
| 协议 | MCP **2026-07-28** sessionless 为主 |
| 传输 | Streamable HTTP（见上节规范链接） |
| HTTP 适配 | `createMcpHandler({ legacy: 'stateless' })` |
| SDK | `@modelcontextprotocol/server` / `node` / `express` **2.0.0** |
| Zod | ^4 |
| 默认端口 | `3333`（`LIGHTDASH_MCP_HTTP_PORT`） |
| 端点 | 工具调用 `…/mcp`；健康检查 `GET /health` |
| 字符集 | 响应 UTF-8；`/mcp` 对 JSON/SSE 自动补 `charset=utf-8` |

`legacy: 'stateless'`：可用无状态方式兼容部分旧客户端流量；**服务端不保存 MCP Session，也不记住「当前项目」**。

---

## 2. 快速接入

### 2.1 命名约定

| 后缀 | 产品 |
|------|------|
| `-lightdash` | 内部 Lightdash 平台 |
| `-x` | 马上赢X |

路径均为 `/mcp`。配置里 `type: "http"` 表示 Streamable HTTP 传输，**不是**「只能用 http://」。`url` 可用 `https://` 或 `http://`（以证书是否覆盖该主机名为准）。

### 2.2 线上（已可用）

| 产品 | 主机 | 推荐 URL |
|------|------|----------|
| 马上赢X | `mcp-x.brandct.com` | `https://mcp-x.brandct.com/mcp` |
| 内部平台 | `mcp-lightdash.banmahui.cn` | `https://mcp-lightdash.banmahui.cn/mcp` |

### 2.3 预发（已可用）

| 产品 | 主机 | 推荐 URL |
|------|------|----------|
| 马上赢X | `mcp-x.pre.banmahui.cn` | `https://mcp-x.pre.banmahui.cn/mcp` |
| 内部平台 | `mcp-lightdash.pre.banmahui.cn` | `https://mcp-lightdash.pre.banmahui.cn/mcp` |

优先使用上表**连字符**主机名。旧名如 `mcp.x.pre.banmahui.cn`（多级点分）可能与通配证书不匹配。

### 2.4 项目根目录 `.mcp.json`

马上赢X：

```json
{
  "mcpServers": {
    "msyx": {
      "type": "http",
      "url": "https://mcp-x.brandct.com/mcp",
      "headers": {
        "x-api-key": "<PAT>"
      }
    },
    "msyx-pre": {
      "type": "http",
      "url": "https://mcp-x.pre.banmahui.cn/mcp",
      "headers": {
        "x-api-key": "<PAT>"
      }
    }
  }
}
```

内部平台：

```json
{
  "mcpServers": {
    "lightdash": {
      "type": "http",
      "url": "https://mcp-lightdash.banmahui.cn/mcp",
      "headers": {
        "x-api-key": "<PAT>"
      }
    },
    "lightdash-pre": {
      "type": "http",
      "url": "https://mcp-lightdash.pre.banmahui.cn/mcp",
      "headers": {
        "x-api-key": "<PAT>"
      }
    }
  }
}
```

---

## 3. 鉴权与项目

### 3.1 鉴权

每个 HTTP 请求需要鉴权。客户端在 `.mcp.json` 的 `headers` 里配置一次即可，**不要**把密钥当工具参数：

- `x-api-key: <PAT>`（推荐）
- 或 `Authorization: Bearer <token>` / `Authorization: ApiKey <…>`

服务端 `LIGHTDASH_API_KEY` 仅在 **`MCP_OAUTH_ENABLED=false`** 时，可作为「请求未带头」的兜底。默认 OAuth 开启时，客户端仍须传 key。共用服务端 key 等于所有访问者共用一把 PAT，公网慎用。

### 3.2 项目

需要项目的工具解析顺序：

1. 工具参数 **`projectUuid`**
2. 否则环境变量 **`LIGHTDASH_PROJECT_UUID`**（进程级默认）
3. 都没有 → 报错（提示先 `list_projects`）

不知道填哪个项目时：先调 **`list_projects`**（不需要 `projectUuid`，只靠鉴权），再把返回的 uuid 传给后续工具。

单项目入口（如 msyx-pre）**建议**在服务端配置 `LIGHTDASH_PROJECT_UUID`，客户端可只配 api-key。没有 `set_project`，服务端不会记住上次选的项目。

### 3.3 站点（部署侧）

服务端必填 **`LIGHTDASH_SITE_URL`**（Lightdash 站点根 URL）。

---

## 4. 工具一览

固定 **23** 个业务工具（另有 prompt `lightdash-analyst`，不算 tool）。相对 v1 少 2 个：`set_project`、`get_current_project`。

| 类别 | 工具 |
|---|---|
| 元信息 / 文档 | `get_site_info`、`get_lightdash_version`、`get_mcp_docs`、`list_projects` |
| Explore / 字段 | `list_explores`、`find_explores`、`find_fields`、`search_field_values` |
| 查询 | `run_metric_query`、`run_semantic_metric_query` |
| 内容 / 看板 | `find_content`、`find_charts`、`find_dashboards`、`find_spaces`、`list_spaces`、`list_dashboards`、`list_charts`、`list_verified_content`、`get_saved_chart`、`get_dashboard_tiles`、`get_dashboard_code`、`run_saved_chart`、`run_dashboard_tiles` 等 |

细节以运行中 tools/list 与 `get_mcp_docs` 为准。

---

## 5. 查询用法与分页

推荐流程：

1. 未知项目 → `list_projects`；已知或已有服务端默认则可跳过。
2. `list_explores` / `find_explores` → `find_fields`。
3. 需要枚举值 → `search_field_values`。
4. 复杂查询 → `run_semantic_metric_query`；简单扁平 → `run_metric_query`。
5. 大结果先缩小 limit / filters；不要猜 fieldId。

### 5.1 两套分页（勿混用）

**查数**（`run_metric_query` / `run_semantic_metric_query`）：用 **`limit` + `offset`**。客户端可固定 limit、递增 offset，直到本页行数 < limit。使用 offset 时请带**稳定 sorts**。不要用 `page` / `pageSize` 做查数翻页；`pageSize` 只影响异步结果拉取块大小。

**目录 / 内容**（`list_explores`、`find_fields`、`find_content` 等）：用 **`page`（从 1）+ `pageSize`**。

### 5.2 Catalog tags

v1 里 `set_project` 的 tags 只用于目录过滤。v2 在 `find_explores` / `find_fields` 上用可选参数 **`catalogTags`**，需要时每次传入。

### 5.3 查数结果形态（`full`）

| | `full: false`（默认） | `full: true` |
|---|---|---|
| `content[0]` | **始终是 CSV 文本** | **仍然是 CSV** |
| `content[1]` | 无 | 多一段完整 JSON 文本 |
| `structuredContent` | `{ queryUuid, valueFormat, rows }` | 含 `rows` / `fields` / `columns` / `warnings` 等 |

客户端应优先读 **`structuredContent`**，或 `full:true` 时的第二段 JSON；不要假定主结果一定是 `{"rows":…}` JSON。

---

## 6. 与 v1 的主要差异

| | v1 `@lightdash/mcp` | v2 `@lightdash/mcp-v2` |
|---|---|---|
| 协议 / 传输 | 偏 2025 Session 模型 | **2026-07-28** + [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) |
| Session | `Mcp-Session-Id`、Registry 等 | 无服务端 Session 状态 |
| `legacy` | （v1 自有 Session 栈） | `createMcpHandler({ legacy: 'stateless' })` |
| 项目记忆 | `set_project` / `get_current_project` | **已移除** |
| 项目怎么带 | 会话 / 参数 / 环境变量 | 参数 `projectUuid` 或 `LIGHTDASH_PROJECT_UUID` |
| Catalog tags | 会话 tags | 可选工具参数 `catalogTags` |
| 查数分页 | 主要 `limit` | **`limit` + `offset`** |
| 查数返回 CSV | 是 | 是（相同约定） |
| 工具数 | 25 | 23 |
| 镜像 CI | 曾指向 v1 Dockerfile | 打 `mcp-v*` tag 构建 v2 |

协议变更影响 Session / 项目记忆；**不是**「协议把返回从 JSON 改成 CSV」。强依赖 `set_project` 的客户端需改适配或继续用 v1。

---

## 7. 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `LIGHTDASH_SITE_URL` | 是 | Lightdash 站点 URL |
| `LIGHTDASH_PROJECT_UUID` | 建议（单项目） | 默认项目；不设则工具须带 `projectUuid` |
| `LIGHTDASH_API_KEY` | 否 | 见 §3.1；默认 OAuth 开启时不能替代客户端 header |
| `LIGHTDASH_MCP_HTTP_PORT` | 否 | 默认 `3333` |
| `LIGHTDASH_MAX_LIMIT` | 否 | 单次 limit 上限，默认 `5000` |
| `LIGHTDASH_MCP_LOG_LEVEL` | 否 | `error` / `warn` / `info` / `debug`，默认 `info` |
| `MCP_OAUTH_ENABLED` | 否 | 默认 `true` |
| `OAUTH_INTROSPECT_URL` | 否 | 默认 `{SITE}/api/v1/oauth/introspect` |
| `OAUTH_REQUIRED_SCOPES` | 否 | 默认 `mcp:read` |
| `OAUTH_RESOURCE_METADATA_URL` | 否 | OAuth 资源元数据 URL |

完整示例见 `packages/lightdash-mcp-v2/.env.example`。

---

## 8. 本地开发

```bash
cp packages/lightdash-mcp-v2/.env.example packages/lightdash-mcp-v2/.env
# 编辑 .env：至少 LIGHTDASH_SITE_URL；单项目建议 LIGHTDASH_PROJECT_UUID

pnpm -F @lightdash/mcp-v2 build
pnpm -F @lightdash/mcp-v2 start:http
# pnpm -F @lightdash/mcp-v2 typecheck
# pnpm -F @lightdash/mcp-v2 test
```

```bash
curl -s http://localhost:3333/health
# 期望含 package: "@lightdash/mcp-v2", protocol, legacy: "stateless"
```

本地客户端 URL 示例：`http://localhost:3333/mcp`。

---

## 9. Docker 与打 tag 发版

| 项 | 值 |
|---|---|
| Workflow | `.github/workflows/build-docker-mcp.yml` |
| Dockerfile | `packages/lightdash-mcp-v2/Dockerfile` |
| 镜像仓 | `registry.cn-hangzhou.aliyuncs.com/winwin/lightdash-mcp` |
| Tag 规则 | `mcp-vX.Y.Z` → 推送 `:X.Y.Z` 与 `:latest` |
| 升版脚本 | `pnpm bump-mcp -- X.Y.Z`（写 mcp-v2 的 `package.json` version） |

```bash
docker build -f packages/lightdash-mcp-v2/Dockerfile -t lightdash-mcp:2.1.2 .
docker run --rm -p 3333:3333 \
  -e LIGHTDASH_SITE_URL="https://your-lightdash.example.com" \
  -e LIGHTDASH_PROJECT_UUID="<uuid>" \
  -e LIGHTDASH_MCP_HTTP_PORT=3333 \
  lightdash-mcp:2.1.2
```

先推含 v2 的代码，再推 `mcp-v*` tag。细部署见 [Docker 部署](./lightdash-mcp-docker-deploy.md)。

---

## 10. 质量与已知边界

- 包内 typecheck 与单测应保持通过。
- 生产签字建议真环境烟测：鉴权 → `list_projects` → `run_metric_query`（含一页 offset）。
- 不是 v1 完美兼容；强依赖 `set_project` 的客户端需改或继续用 v1。
- Docker 安装使用 `--no-frozen-lockfile`（lockfile 可能无 v2 importer）。
- HTTPS 需证书覆盖实际主机名；不匹配时客户端校验会失败（服务本身可能仍通）。

---

## 11. 相关路径

| 路径 | 说明 |
|---|---|
| `packages/lightdash-mcp-v2/` | 本包源码 |
| `packages/lightdash-mcp/` | v1 |
| `.github/workflows/build-docker-mcp.yml` | tag 构建推送 |
| `scripts/bump-versions.mjs` | `pnpm bump-mcp` |
| `docs/mcp/README.md` | 文档索引 |
| MCP Streamable HTTP 规范 | https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http |

---

*文档版本：2026-09-16 · `#` / `##` / `###` 分层；无引用块。*
