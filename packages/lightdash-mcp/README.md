# @lightdash/mcp

独立运行的 Lightdash [Model Context Protocol](https://modelcontextprotocol.io) 服务，面向 Claude Code、Cursor 等客户端。通过站点 **REST API** 注册 **25 个 MCP 工具**（**17** 个核心：健康/项目/目录/内容/查询/文档；**8** 个站点与已保存图表/看板导出相关），以及 **`lightdash-analyst`** 提示词；工具名**统一无前缀**（与 EE 内置 MCP 对齐的仍用上游同名，如 `find_charts`）。不托管在 Lightdash 进程内，适合单独扩缩或与主站版本解耦。

---

## 快速开始

1. 在 monorepo 根目录配置环境变量（可复制 `[./.env.example](./.env.example)` 并改名）。
2. 构建并启动 HTTP 传输：

```bash
pnpm -F @lightdash/mcp build
pnpm -F @lightdash/mcp start:http
```

1. 默认监听 `http://0.0.0.0:3333`，MCP 路径为 `**/mcp**`（Streamable HTTP）。

客户端（示例：Cursor `.mcp.json`）在 `url` 指向上述地址的同时，可用 `**x-api-key**` 传入 PAT（也可不设，改由服务端 `LIGHTDASH_API_KEY` 兜底）：

```json
{
  "mcpServers": {
    "lightdash": {
      "type": "http",
      "url": "http://localhost:3333/mcp",
      "headers": {
        "x-api-key": "<your-personal-access-token>"
      }
    }
  }
}
```

也可使用 OAuth：不带认证访问 `/mcp` 时会返回 `401 + WWW-Authenticate(resource_metadata=...)`，客户端按主站 metadata 完成授权后，用 `Authorization: Bearer <token>` 调用本 MCP。

可选：在同一 `headers` 中加入 `**X-Lightdash-User-Attributes**`，值为 **合法 JSON 字符串**（见下文「鉴权与请求头」）。

### Claude Code / Claude CLI（`claude mcp add`）

在终端用 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 自带的 MCP 子命令注册本服务（`-t http` 表示 Streamable HTTP）。将 URL 换成你的 MCP 地址；PAT 建议用环境变量，避免写进 shell 历史。

```bash
export LIGHTDASH_MCP_APIKEY="your-personal-access-token"

claude mcp add lightdash-mcp http://localhost:3333/mcp \
  -H "x-api-key: $LIGHTDASH_MCP_APIKEY" \
  -t http
```

与自建网关域名、端口对齐时，也可写成单行（与 `claude mcp add --help` 习惯一致），例如：

```bash
claude mcp add lightdash-mcp http://npc.example.com:17808/mcp -H "x-api-key: $LIGHTDASH_MCP_APIKEY" -t http
```

说明：

- 本服务从 MCP **HTTP 请求头**读取 PAT 时，只认 `**x-api-key`**（与 `LIGHTDASH_API_KEY` 的兜底语义一致）。若写成 `apikey:` 等其它头名，**默认不会生效**；只有在你前面还有反向代理把其它头映射成 `x-api-key` 时，才可继续用代理约定的那套头名。
- `LIGHTDASH_MCP_APIKEY` 仅为示例变量名，可与 shell 或 CI 里已有名称统一；也可直接使用 `LIGHTDASH_API_KEY` 等，只要 `-H` 里展开的是 PAT 即可。

---

## 环境变量


| 变量                               | 必填  | 说明                                                     |
| -------------------------------- | --- | ------------------------------------------------------ |
| `LIGHTDASH_SITE_URL`             | 是   | Lightdash 站点根 URL（无尾斜杠亦可）                              |
| `LIGHTDASH_PROJECT_UUID`         | 否   | MCP 默认项目 UUID；未传时可依赖 **`set_project`** 或各工具可选参数 **`projectUuid`**（见下节） |
| `LIGHTDASH_API_KEY`              | 否   | 默认 PAT（仅在 OAuth 关闭时作为请求兜底）；OAuth 模式下用于调用 introspect        |
| `LIGHTDASH_MAX_LIMIT`            | 否   | 查询类接口的 `limit` 上限                                      |
| `LIGHTDASH_MCP_HTTP_PORT`        | 否   | HTTP 端口，默认 `3333`                                      |
| `MCP_OAUTH_ENABLED`              | 否   | 是否启用 OAuth（`true/false`，默认 `true`）                 |
| `OAUTH_INTROSPECT_URL`           | 否   | introspect 地址（默认 `<LIGHTDASH_SITE_URL>/api/v1/oauth/introspect`） |
| `OAUTH_REQUIRED_SCOPES`          | 否   | 逗号分隔 scope，默认 `mcp:read`                               |
| `OAUTH_RESOURCE_METADATA_URL`    | 否   | 401 挑战头中的 `resource_metadata` URL                        |
| `LIGHTDASH_MCP_MAX_SESSIONS`     | 否   | 最大并发 MCP session 数，默认 `100`（全局硬上限，含 stateful + compat + pending） |
| `LIGHTDASH_MCP_SOFT_SESSIONS_PER_OWNER` | 否 | 单 owner 标准 Session 软上限，默认 `10`（超出优先回收空闲） |
| `LIGHTDASH_MCP_MAX_SESSIONS_PER_OWNER` | 否 | 单 owner 标准 Session 硬上限，默认 `20`（无可回收候选时拒绝新建） |
| `LIGHTDASH_MCP_LRU_MIN_IDLE_MS`  | 否   | LRU 候选最小空闲时间，默认 `300000`（5 分钟） |
| `LIGHTDASH_MCP_SESSION_TTL_MS`   | 否   | 无业务活动（POST/DELETE）后的回收 TTL，默认 `900000`（15 分钟） |
| `LIGHTDASH_MCP_PRUNE_INTERVAL_MS`| 否   | 后台 prune 间隔，默认 `300000`（5 分钟）                         |

### 多用户并发与内存防护

本服务支持**多用户同时连接**：每个 MCP 客户端在 `initialize` 后获得独立 `Mcp-Session-Id`，GET/POST 按 session 隔离，不再出现「仅一人可用 GET SSE、他人 409」的问题。

**Session 归属**：`Mcp-Session-Id` 与认证身份（PAT 哈希或 OAuth subject）绑定。携带他人 session id 的请求会返回 **404**，无法干扰或关闭他人 session。

内存防护（进程内，无 Redis）：

1. **全局硬上限**：`LIGHTDASH_MCP_MAX_SESSIONS`；满额时先回收空闲 session，再 LRU 淘汰**至少空闲 5 分钟且无进行中业务请求**的最旧 session；仍满则返回 **503**。
2. **单 owner 软/硬上限**：默认软上限 `10`、硬上限 `20`。超过软上限时优先关闭该 owner 空闲 ≥5 分钟且无进行中请求的最旧标准 Session；无可回收候选时允许增长到硬上限；达到硬上限仍无候选则 **503**，不中断刚活跃或正在查询的 Session。compat 通道不占 soft/hard 额度，但仍计入全局上限。
3. **业务空闲 TTL**：超过 `LIGHTDASH_MCP_SESSION_TTL_MS`（默认 15 分钟）无 POST/DELETE 业务活动即可回收，**即使 SSE 仍连接**。GET/SSE 重连不刷新业务活动时间。未完成 initialize 的 pending session 也会按同一 TTL 回收。
4. **进行中请求保护**：仅 `activeRequestLeases > 0`（进行中的 POST/DELETE）阻止 TTL/LRU；SSE 单独连接不再永久豁免。
5. **共享 explore 缓存**：多 session 共用进程级 explore 元数据缓存，但缓存键包含凭证哈希，不同 PAT/OAuth token 不会互相命中，避免跨用户元数据泄露。
6. **同 PAT 多客户端并发**：同一 PAT（或 OAuth subject）可同时持有多个独立 session（例如 `config_ui` 与 CLI 并行），受 soft/hard 上限约束。每个客户端必须保存 `initialize` 响应头中的 `Mcp-Session-Id`，并在后续 POST/GET `/mcp` 请求中回传。GET SSE 断开后**不会立即销毁 session**；session 由 TTL、DELETE 或 LRU 回收。
7. **服务端兜底 PAT**：若 `MCP_OAUTH_ENABLED=false` 且客户端未传 `x-api-key`，所有请求共用 `LIGHTDASH_API_KEY`，视为同一 owner；多个客户端仍会各自创建独立 session，但共享同一认证身份。

运维调参建议：

| 容器 memory | 建议 `MAX_SESSIONS` |
| ----------- | ------------------- |
| 2GB         | 50–100              |
| 4GB         | 150–200             |

- 若频繁 **503** → 增大 `MAX_SESSIONS` / 单 owner 硬上限，或缩短 `SESSION_TTL_MS`
- 若 **OOM** → 降低 `MAX_SESSIONS` 或增大容器 memory
- `/health` 返回 `activeSessions`、`pendingSessions`、`compatSessions`、`activeSseConnections`、`inFlightRequests` 便于监控

**限制**：session 与 `set_project` 状态均在本进程内存；多副本部署时 session **不跨实例共享**，需 sticky session 或单实例（与原有 `set_project` 限制一致）。

**无 Session 兼容（compat）**：存量客户端可直接 `POST /mcp` 调 `tools/call`（不带 `Mcp-Session-Id`），服务端按鉴权身份隔离兼容通道。新接入请仍用标准 Session。详见下方文档。

### MCP 健康检查与调用约定

Streamable HTTP MCP **只有** `GET /health` 与 `ALL /mcp` 两个路由。`tools/list`、`tools/call` 是 **JSON-RPC method**，写在 POST `/mcp` 的 body 里，**不是** `/mcp/tools/list` 这类 URL 子路径。非法 JSON body 返回 **400**（`Invalid JSON body`），日志标记 `invalid_json_body`。

正确冒烟流程：

```bash
# 1. 健康检查（应含 activeSessions / pendingSessions / compatSessions / activeSseConnections / inFlightRequests）
curl -s http://localhost:3333/health

# 2. initialize（从响应头取 Mcp-Session-Id）
curl -i -X POST 'http://localhost:3333/mcp' \
  -H 'x-api-key: YOUR_PAT' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}},"id":1}'

# 3. tools/list（仍是 POST /mcp，带上一步的 Mcp-Session-Id）
curl -X POST 'http://localhost:3333/mcp' \
  -H 'x-api-key: YOUR_PAT' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Session-Id: <session-id-from-step-2>' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

服务端 404 日志会区分内部原因（`missing Mcp-Session-Id header` / `unknown or expired session id` / `owner mismatch`），但客户端统一收到 `Session not found`。

**客户端接入规范（标准 Session / 存量兼容 / projectUuid / 排障）**：

- 索引：[`docs/mcp/README.md`](../../docs/mcp/README.md)
- 标准用法：[`docs/mcp/lightdash-mcp-client-usage.md`](../../docs/mcp/lightdash-mcp-client-usage.md)

### 项目 `projectUuid` 解析顺序

对需要项目的工具（含 **`list_spaces`**、**`run_saved_chart`** 与核心工具），有效项目 UUID 按：

1. **本次工具入参** `projectUuid`（若传入非空字符串）  
2. **`set_project`** 写入的会话项目（按 PAT 隔离，内存）  
3. **环境变量** `LIGHTDASH_PROJECT_UUID`

三者皆无时，工具调用会**报错**（进程仍可启动；未配环境默认时属 **fail-late**，部署文档请说明须先 `set_project` 或传参）。

---

## 鉴权与请求头

### Personal Access Token（PAT）与 OAuth Bearer

API key 模式下，对 Lightdash 后端的出站请求使用：

`Authorization: ApiKey <token>`

OAuth 模式下（`MCP_OAUTH_ENABLED=true` 且请求头为 `Authorization: Bearer <token>`）：

- MCP 会调用主站 introspect 校验 `active=true` 且满足 `OAUTH_REQUIRED_SCOPES`。
- 校验通过后，下游请求优先透传 Bearer；若主站接口不接受 Bearer，请改用 `x-api-key`（连接配置层）。

Token 解析顺序（ApiKey 路径）：MCP HTTP 请求头 `x-api-key` / `Authorization: ApiKey` → 环境变量 `LIGHTDASH_API_KEY`。

工具参数层不再要求传 `apiKey`；建议在 `.mcp.json` 连接配置中设置一次 `x-api-key`。

未带认证调用 `/mcp` 将返回：

- `HTTP 401`
- `WWW-Authenticate: Bearer resource_metadata="<OAUTH_RESOURCE_METADATA_URL>"`

### X-Lightdash-User-Attributes（可选）

在连接本 MCP 的 HTTP 客户端上设置该请求头时，服务在校验后会把**原始字符串**附加到对 Lightdash 的 `fetch` 上。

- 值须为可被 `JSON.parse` 解析的 JSON（任意合法 JSON 类型均可）。
- 长度超过 `**MAX_USER_ATTRIBUTES_HEADER_CHARS`（当前为 32768）** 或解析失败时，**丢弃该头且不报错**，请求仍用 PAT 继续。

行级安全、属性类策略等语义与主站一致，前提是主站 API 支持该头。

---

## 工具与提示词一览

工具名以本服务实际注册为准；命名列表见 **[`DEV_TOOL_NAMES.md`](./DEV_TOOL_NAMES.md)**。

### 核心工具（17 个）

`get_lightdash_version` · `get_mcp_docs` · `list_projects` · `set_project` · `get_current_project` · `list_explores` · `find_explores` · `find_fields` · `find_content` · `find_charts` · `find_dashboards` · `find_spaces` · `list_dashboards` · `list_verified_content` · `search_field_values` · `run_semantic_metric_query` · `run_metric_query`

说明要点：

- `get_mcp_docs`：返回内置精简使用说明（`topic`：`overview` / `query_workflow` / `session_lifecycle` / `security`）。静态文本随构建发布，不读本地 `docs/mcp`、不访问远程 URL、不接受密钥；**不替代**客户端 transport 的 Session 清理责任。
- `get_lightdash_version`：首条返回内容为短 **version** 文本（无则 `unknown`），第二条为完整 health JSON。
- `find_charts` / `find_dashboards` / `find_spaces`：与上游 EE 内置 MCP 命名对齐，分别固定 `contentTypes` 为 chart / dashboard / space；`find_content` 为**不传类型过滤**的混合关键词搜索。
- `list_dashboards`：按 `spaceUuid` **层级浏览**空间下看板（非关键词搜索）；搜名称仍用 `find_dashboards`。
- `run_semantic_metric_query` / `run_metric_query`：首条 **CSV** + `structuredContent`（默认 `valueFormat=raw`；`valueFormat=formatted` 为 Explorer 展示值；`full=true` 额外返回嵌套 rows、fields、warnings 及第二条 JSON）
- `run_metric_query`：扁平参数（`exploreName` + `dimensions[]` + `metrics[]`），简单查询。规则在 `src/mcp/toolDescriptions/runMetricQueryFlat.ts`。
- 文档索引：[`docs/mcp/README.md`](../../docs/mcp/README.md)
- `find_explores` / `find_fields`：对 `dataCatalog` 返回的条目附加 `**heuristicScore**` 并按其降序排列；响应含 `**heuristicRankingVersion**`（当前为 `1`）。
- `list_verified_content`：先做版本守卫，再尝试路由调用；若站点未部署该接口会返回中文提示而非裸 404。

### 站点与已保存图表（8 个）

与核心工具同一 PAT；在扩展注册顺序上先于核心工具加载，名称无前缀。

| 工具名                  | 用途                                                       |
| -------------------- | ---------------------------------------------------------- |
| `get_site_info`      | 返回 `siteBaseUrl`（与 `LIGHTDASH_SITE_URL` 一致）                |
| `list_spaces`        | 列出当前项目下的空间（层级浏览，默认精简输出）                        |
| `list_charts`        | 按 `dashboardUuid` 列出看板内已保存图表磁贴（层级浏览）                  |
| `get_saved_chart`    | 按图表 UUID 拉取已保存图表定义（含 `webUrl`，默认精简输出）                      |
| `run_saved_chart`    | 按已保存图表 UUID 执行查询（与 metric 查询一致：CSV + valueFormat；`full=true` 返回 fields/warnings） |
| `get_dashboard_tiles`| 查看看板磁贴布局与图表关联                                              |
| `run_dashboard_tiles`| 批量执行看板中的 `saved_chart` 磁贴（其他磁贴类型会跳过并给出原因）                 |
| `get_dashboard_code` | 导出看板 as-code 配置（基于 `/api/v1/projects/{projectUuid}/dashboards/code`） |


### 提示词

- `**lightdash-analyst**`：固定分析师说明（工具名与上文一致）。

---

## 与主站内置 MCP 的差异


| 维度                              | 主站内置 MCP               | 本包（独立服务）                                                            |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| 部署                              | 随 Lightdash 进程         | 独立 Node 进程                                                          |
| 传输                              | 由主站提供                  | Streamable HTTP（`/mcp`）                                             |
| 会话上下文                           | 主站持久化（如 `mcp_context`） | `set_project` 仅存**本进程内存**（按 PAT 哈希隔离）                 |
| `find_explores` / `find_fields` | 主站内置实现                 | **dataCatalog** REST；结果含 `heuristicScore`、`heuristicRankingVersion` |
| User-Attributes                 | 由主站入口注入                | 由 **MCP 客户端 HTTP 头** 注入并转发                                          |
| 扩展工具                            | 无 dashboard 扩展工具         | 额外提供 `get_dashboard_tiles` / `run_dashboard_tiles` / `get_dashboard_code` |
| 输出控制                            | 以内置输出策略为主               | 默认精简，支持 `full=true` 返回完整结构                                             |


---

## 构建

```bash
pnpm -F @lightdash/mcp build
pnpm -F @lightdash/mcp test
```

## 版本号与发版（`mcp-v*`）

- **运行时**：本包 **[`package.json`](./package.json)** 的 **`version`**（Server 元数据与启动日志）。
- **与 lightdash-skills 同号发布**：须与本仓库内 **`packages/lightdash-skills/version.json`** 的 `version` 一致；打 **`mcp-v*`** tag、触发 Docker 构建与推送等，按本 monorepo 既有流程执行（具体命令与脚本选项见仓库内维护文档，不在此罗列）。

## Docker

```bash
docker build -f packages/lightdash-mcp/Dockerfile -t lightdash-mcp:0.1.0 .

docker run --rm -p 3333:3333 \
  -e LIGHTDASH_SITE_URL="https://your-lightdash.example.com" \
  -e LIGHTDASH_PROJECT_UUID="your-project-uuid" \
  -e LIGHTDASH_MCP_HTTP_PORT=3333 \
  lightdash-mcp:0.1.0
# LIGHTDASH_PROJECT_UUID 可省略：须由客户端先 set_project 或在工具参数中传 projectUuid
```

CI 推阿里云时镜像为 **`registry.cn-hangzhou.aliyuncs.com/winwin/lightdash-mcp:<版本>`**，发布线同时打 **`:latest`**；打 Git tag **`mcp-vX.Y.Z`** 触发（详见 `docs/mcp/lightdash-mcp-docker-deploy.md`）。

若客户端始终在请求里带 `x-api-key`，容器内可不设 `LIGHTDASH_API_KEY`；需要服务端默认 PAT 时再挂载该环境变量。

---

## 常见排障（含 422）

- **422**：多为请求体验证失败；权限问题更常见 **401 / 403**。
- **Metric Query**：Explorer JSON 字符串 → `run_semantic_metric_query` + `metricQuery`；简单查询 → `run_metric_query` 扁平字段。
- `**context`**：须为 Lightdash 支持的枚举（如 `mcp`），不要传自然语言描述。
- 过滤条件依赖 `**lightdash.user.email**` 时，请使用当前 PAT 用户的邮箱；主邮箱未验证时可能为空。
- OAuth 报 `missing required scopes`：检查主站客户端授权 scope，至少包含 `OAUTH_REQUIRED_SCOPES`。
- OAuth 报 `Auth service unavailable`：检查 `OAUTH_INTROSPECT_URL` 连通性和 `LIGHTDASH_API_KEY` 是否有效。
- OAuth token 过期/失效：会返回 401 并附带 `WWW-Authenticate`，按 metadata 重新授权。

---

## 相关仓库与文档

- 文档索引：[`docs/mcp/README.md`](../../docs/mcp/README.md)
- 标准客户端用法：[`docs/mcp/lightdash-mcp-client-usage.md`](../../docs/mcp/lightdash-mcp-client-usage.md)
- 分析师说明：[`docs/mcp/lightdash-mcp-user-guide.md`](../../docs/mcp/lightdash-mcp-user-guide.md)
- 查询速查：[`docs/mcp/lightdash-mcp-query-tools-quickref.md`](../../docs/mcp/lightdash-mcp-query-tools-quickref.md)
- Docker：[`docs/mcp/lightdash-mcp-docker-deploy.md`](../../docs/mcp/lightdash-mcp-docker-deploy.md)
- Skills：`packages/lightdash-skills`

## 可执行入口

- npm bin：`lightdash-mcp-http` → `dist/http.js`

