# @lightdash/mcp

独立运行的 Lightdash [Model Context Protocol](https://modelcontextprotocol.io) 服务，面向 Claude Code、Cursor 等客户端。通过站点 **REST API** 注册 **24 个 MCP 工具**（**16** 个核心：健康/项目/目录/内容/查询；**8** 个站点与已保存图表/看板导出相关），以及 **`lightdash-analyst`** 提示词；工具名**统一无前缀**（与 EE 内置 MCP 对齐的仍用上游同名，如 `find_charts`）。不托管在 Lightdash 进程内，适合单独扩缩或与主站版本解耦。

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

`get_lightdash_version` · `list_projects` · `set_project` · `get_current_project` · `list_explores` · `find_explores` · `find_fields` · `find_content` · `find_charts` · `find_dashboards` · `find_spaces` · `list_dashboards` · `list_verified_content` · `search_field_values` · `run_sql` · `run_semantic_metric_query` · `run_metric_query`

说明要点：

- `get_lightdash_version`：首条返回内容为短 **version** 文本（无则 `unknown`），第二条为完整 health JSON。
- `find_charts` / `find_dashboards` / `find_spaces`：与上游 EE 内置 MCP 命名对齐，分别固定 `contentTypes` 为 chart / dashboard / space；`find_content` 为**不传类型过滤**的混合关键词搜索。
- `list_dashboards`：按 `spaceUuid` **层级浏览**空间下看板（非关键词搜索）；搜名称仍用 `find_dashboards`。
- `run_semantic_metric_query`：Explorer 整段 **metricQuery** JSON 直通（AI 主路径）。首条 **CSV**。规则与案例在 `src/mcp/toolDescriptions/runSemanticMetricQuery.ts`（构建后进 `tools/list` description）。
- `run_metric_query`：扁平参数（`exploreName` + `dimensions[]` + `metrics[]`），简单查询。规则在 `src/mcp/toolDescriptions/runMetricQueryFlat.ts`。
- 维护者文档（AI 不可见）：`docs/mcp/lightdash-mcp-*.md`
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
| `run_saved_chart`    | 按已保存图表 UUID 执行查询（默认平铺行，`full=true` 返回完整结构）                  |
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
- **Metric Query**：Explorer JSON → `run_semantic_metric_query` + `metricQuery`；简单查询 → `run_metric_query` 扁平字段。
- `**context`**：须为 Lightdash 支持的枚举（如 `mcp`），不要传自然语言描述。
- 过滤条件依赖 `**lightdash.user.email**` 时，请使用当前 PAT 用户的邮箱；主邮箱未验证时可能为空。
- OAuth 报 `missing required scopes`：检查主站客户端授权 scope，至少包含 `OAUTH_REQUIRED_SCOPES`。
- OAuth 报 `Auth service unavailable`：检查 `OAUTH_INTROSPECT_URL` 连通性和 `LIGHTDASH_API_KEY` 是否有效。
- OAuth token 过期/失效：会返回 401 并附带 `WWW-Authenticate`，按 metadata 重新授权。

---

## 相关仓库与文档

- 技能与示例：`packages/lightdash-skills`
- 总览：`[docs/lightdash-mcp.md](../../docs/lightdash-mcp.md)`
- 分析师向说明：`[docs/lightdash-mcp-user-oriented-tools.md](../../docs/lightdash-mcp-user-oriented-tools.md)`
- Docker 部署：`[docs/mcp/lightdash-mcp-docker-deploy.md](../../docs/mcp/lightdash-mcp-docker-deploy.md)`

## 可执行入口

- npm bin：`lightdash-mcp-http` → `dist/http.js`

