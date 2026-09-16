# Lightdash MCP v2 说明与使用（最新）

> **状态（2026-09-16）**：可稳定交付。包名 `@lightdash/mcp-v2`，目录 `packages/lightdash-mcp-v2`。  
> **与 v1 关系**：并行存在，**不是** v1 无感替换。v1 仍在 `packages/lightdash-mcp`（`@lightdash/mcp`）。  
> 本文为当前分支 `feat/mcp-v2` 上的最新记录；包内 README、Docker 文档以本文为准做摘要索引。

---

## 1. 这是什么

独立 MCP HTTP 服务，把 Lightdash REST 能力暴露给 Cursor / Claude Code 等 MCP 客户端。

| 项 | v2 |
|---|---|
| 包 | `@lightdash/mcp-v2` |
| 协议 | MCP **2026-07-28** sessionless 为主 |
| HTTP 适配 | `createMcpHandler({ legacy: 'stateless' })` |
| SDK | `@modelcontextprotocol/server` / `node` / `express` **2.0.0**（当前 npm 最新正式版） |
| Zod | ^4 |
| 默认端口 | `3333`（`LIGHTDASH_MCP_HTTP_PORT`） |
| 端点 | `POST/… /mcp`，健康检查 `GET /health` |
| 字符集 | 响应 UTF-8；`/mcp` 对 JSON/SSE 自动补 `charset=utf-8`（兼容 Python requests 等） |

`legacy: 'stateless'`：可用无状态方式兼容部分旧客户端流量；**服务端不保存 MCP Session，也不记住「当前项目」**。

---

## 2. 和 v1 的主要差异

| | v1 `@lightdash/mcp` | v2 `@lightdash/mcp-v2` |
|---|---|---|
| Session | `Mcp-Session-Id`、Registry、可选 GET SSE / DELETE | 无服务端 Session 状态 |
| 项目记忆 | `set_project` / `get_current_project` | **已移除** |
| 项目怎么带 | 会话 / 参数 / 环境变量 | **每次**工具参数 `projectUuid`，或环境变量 `LIGHTDASH_PROJECT_UUID` |
| Catalog tags | `set_project` 的 `tags` 进会话 | 工具可选参数 `catalogTags`（`find_explores` / `find_fields`） |
| 查数分页 | 主要 `limit`（offset 未透传） | **`limit` + `offset`**（仓库级）；建议稳定 `sorts` |
| 列表分页 | `page` + `pageSize` | 同左（目录/内容工具） |
| 镜像 CI | 曾指向 v1 Dockerfile | 打 `mcp-v*` tag 构建 **v2** Dockerfile |

业务查询 / 内容 / 目录工具大体保留；鉴权仍是请求头（或可选服务端默认 Key）。

---

## 3. 必须携带什么

### 3.1 鉴权（每个 HTTP 请求）

客户端配置一次即可，**不要**把密钥当工具参数：

- `x-api-key: <PAT>`，或  
- `Authorization: Bearer <token>` / `Authorization: ApiKey <…>`  

可选：容器/进程设 `LIGHTDASH_API_KEY` 作无 OAuth 时的兜底。

### 3.2 项目

需要项目的工具必须满足其一：

1. 工具参数 **`projectUuid`**（推荐每次显式传）  
2. 环境变量 **`LIGHTDASH_PROJECT_UUID`**（整进程默认，不是按用户会话）

**不知道该填哪个项目时**：先调用 **`list_projects`**（不需要 `projectUuid`，只依赖鉴权），从返回列表选择 uuid，再带入后续工具。  
客户端若未传 `projectUuid`，且服务端也未配置默认项目，需要项目的工具会报错，并提示先用 `list_projects`。

没有 `set_project`，服务端不会记住上次选的项目。

### 3.3 站点

必填环境变量：**`LIGHTDASH_SITE_URL`**（Lightdash 站点根 URL，无尾斜杠亦可）。

---

## 4. 分页怎么用（勿混用两套）

### 查数：`run_metric_query` / `run_semantic_metric_query`

- 用 **`limit` + `offset`**（仓库跳过行数）。  
- 客户端可固定 `limit`、递增 `offset`，直到本页行数 &lt; `limit`。  
- **使用 `offset` 时请带稳定 `sorts`**，否则可能乱序 / 重复 / 漏行。  
- **`page` / `pageSize` 不要用来做查数翻页**；`pageSize` 只影响异步结果拉取块大小（服务端会收齐）。

### 目录 / 内容：`list_explores`、`find_fields`、`find_content` 等

- 用 **`page`（从 1）+ `pageSize`**。

### 以前的 tags

v1 会话里的 `tags` 只用于目录 API 的 **`catalogTags` 过滤**（治理标签，不是 metric filter）。  
v2 在 `find_explores` / `find_fields` 上每次可选传 `catalogTags`。

---

## 5. 工具一览（v2）

### 已移除（相对 v1）

- `set_project`  
- `get_current_project`  

### 仍提供（常用）

| 类别 | 工具 |
|---|---|
| 元信息 / 文档 | `get_site_info`、`get_lightdash_version`、`get_mcp_docs`、`list_projects` |
| Explore / 字段 | `list_explores`、`find_explores`、`find_fields`、`search_field_values` |
| 查询 | `run_metric_query`、`run_semantic_metric_query` |
| 内容 / 看板 | `find_content`、`find_charts`、`find_dashboards`、`find_spaces`、`list_*`、`get_saved_chart`、`get_dashboard_tiles`、`get_dashboard_code`、`list_verified_content`、`run_saved_chart`、`run_dashboard_tiles` 等 |

Prompt：`lightdash-analyst`。

细节以运行中的 tools/list 与 `get_mcp_docs` 为准。

---

## 6. 本地开发

```bash
# 在仓库根
cp packages/lightdash-mcp-v2/.env.example packages/lightdash-mcp-v2/.env
# 编辑 .env：至少 LIGHTDASH_SITE_URL；建议 LIGHTDASH_PROJECT_UUID / LIGHTDASH_API_KEY

pnpm -F @lightdash/mcp-v2 build
pnpm -F @lightdash/mcp-v2 start:http
# 或：pnpm -F @lightdash/mcp-v2 typecheck
#     pnpm -F @lightdash/mcp-v2 test
```

健康检查：

```bash
curl -s http://localhost:3333/health
# 期望含 package: "@lightdash/mcp-v2", protocol, legacy: "stateless"
```

MCP 客户端 URL 示例：`http://localhost:3333/mcp`，并配置鉴权 Header。

---

## 7. 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `LIGHTDASH_SITE_URL` | 是 | Lightdash 站点 URL |
| `LIGHTDASH_PROJECT_UUID` | 否 | 默认项目；不设则工具须带 `projectUuid` |
| `LIGHTDASH_API_KEY` | 否 | 默认 PAT（客户端不带头时） |
| `LIGHTDASH_MCP_HTTP_PORT` | 否 | 默认 `3333` |
| `LIGHTDASH_MAX_LIMIT` | 否 | 单次查询 limit 上限，默认 `5000` |
| `LIGHTDASH_MCP_LOG_LEVEL` | 否 | `error`/`warn`/`info`/`debug`，默认 `info`；`debug` 才打鉴权缓存命中与 2xx 访问日志 |
| `MCP_OAUTH_ENABLED` | 否 | 默认 `true` |
| `OAUTH_INTROSPECT_URL` | 否 | 默认 `{SITE}/api/v1/oauth/introspect` |
| `OAUTH_REQUIRED_SCOPES` | 否 | 默认 `mcp:read` |
| `OAUTH_RESOURCE_METADATA_URL` | 否 | OAuth 资源元数据 URL |

完整示例见 `packages/lightdash-mcp-v2/.env.example`。

---

## 8. Docker 与打 tag 发版

当前分支上，**打 `mcp-v*` tag 会构建 v2 镜像**。

| 项 | 值 |
|---|---|
| Workflow | `.github/workflows/build-docker-mcp.yml` |
| Dockerfile | `packages/lightdash-mcp-v2/Dockerfile` |
| 镜像仓 | `registry.cn-hangzhou.aliyuncs.com/winwin/lightdash-mcp` |
| Tag 规则 | `mcp-vX.Y.Z` → 推送 `:X.Y.Z` 与 `:latest` |
| 升版脚本 | `pnpm bump-mcp -- X.Y.Z`（写 **mcp-v2** 的 `package.json` version → commit → annotated tag） |

本地构建：

```bash
docker build -f packages/lightdash-mcp-v2/Dockerfile -t lightdash-mcp:2.0.0 .
docker run --rm -p 3333:3333 \
  -e LIGHTDASH_SITE_URL="https://your-lightdash.example.com" \
  -e LIGHTDASH_PROJECT_UUID="<uuid>" \
  -e LIGHTDASH_MCP_HTTP_PORT=3333 \
  lightdash-mcp:2.0.0
```

发版注意：先把含 v2 与 CI 改动的代码推到要打 tag 的分支，再 `git push origin mcp-vX.Y.Z`。只推 tag、不推代码，CI 仍可能用旧 Dockerfile。

更细的部署步骤见 [Docker 部署](./lightdash-mcp-docker-deploy.md)（路径已指向 v2 Dockerfile）。

---

## 9. 客户端接入要点

1. URL 指向 v2 服务的 `/mcp`。  
2. 配置鉴权 Header。  
3. 需要项目时：未知则先 `list_projects`；再带 `projectUuid`，或依赖服务端 `LIGHTDASH_PROJECT_UUID`。  
4. 大结果：查数用 `limit`/`offset` + 稳定 `sorts`；列表用 `page`/`pageSize`。  
5. 不要依赖 `set_project` 或服务端 Session 记忆。  
6. 需要时调用 `get_mcp_docs`（`overview` / `query_workflow` / `content_fields` / `security`）。

示例（概念形状）：

```json
{
  "exploreName": "orders",
  "dimensions": ["orders_order_date_month"],
  "metrics": ["orders_total_order_amount"],
  "filters": {},
  "sorts": [{ "fieldId": "orders_order_date_month", "descending": false }],
  "limit": 2000,
  "offset": 0,
  "projectUuid": "<optional-if-env-set>"
}
```

---

## 10. 质量与已知边界

- `pnpm -F @lightdash/mcp-v2 typecheck` 与包内单测（约 86）在开发机已通过。  
- **生产签字**仍建议真环境烟测：鉴权 → `list_projects` → `run_metric_query`（含一页 `offset`）。  
- 不是 v1 完美兼容；旧客户端若强依赖会话项目 / `set_project`，需改客户端或继续用 v1 包。  
- Docker 安装使用 `--no-frozen-lockfile`（本地可能禁止写入 lockfile，v2 importer 未必在 lockfile 中）。

---

## 11. 相关路径

| 路径 | 说明 |
|---|---|
| `packages/lightdash-mcp-v2/` | 本包源码 |
| `packages/lightdash-mcp/` | v1（勿与 v2 混用同一套会话假设） |
| `.github/workflows/build-docker-mcp.yml` | tag 构建推送 |
| `scripts/bump-versions.mjs` | `pnpm bump-mcp` |
| `docs/mcp/README.md` | 文档索引 |

---

*文档版本：2026-09-16 · 对应包版本以 `packages/lightdash-mcp-v2/package.json` 为准（当前常见为 `2.0.0`）。*
