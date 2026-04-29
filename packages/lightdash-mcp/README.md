# @lightdash/mcp

独立运行的 Lightdash [Model Context Protocol](https://modelcontextprotocol.io) 服务，面向 Claude Code、Cursor 等客户端。通过站点 **REST API** 提供 **16 个标准 MCP 工具名**（与 Lightdash 文档中的工具名一致）、`**lightdash-analyst`** 提示词，以及 4 个 `**lightdash_*` 扩展工具。不托管在 Lightdash 进程内，适合单独扩缩或与主站版本解耦。

---

## 快速开始

1. 在 monorepo 根目录配置环境变量（可复制 `[./.env.example](./.env.example)` 并改名）。
2. 构建并启动 HTTP 传输：

```bash
pnpm -F @lightdash/mcp build
pnpm -F @lightdash/mcp start:http
```

1. 默认监听 `http://0.0.0.0:3333`，MCP 路径为 `**/mcp**`（Streamable HTTP）。

客户端（示例：Cursor `.mcp.json`）在 `url` 指向上述地址的同时，用 `**x-api-key**` 传入 PAT（也可不设，改由服务端 `LIGHTDASH_API_KEY` 兜底）：

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

- 本服务从 MCP **HTTP 请求头**读取 PAT 时，只认 `**x-api-key`**（与 `LIGHTDASH_API_KEY` / 工具参数 `apiKey` 的语义一致）。若写成 `apikey:` 等其它头名，**默认不会生效**；只有在你前面还有反向代理把其它头映射成 `x-api-key` 时，才可继续用代理约定的那套头名。
- `LIGHTDASH_MCP_APIKEY` 仅为示例变量名，可与 shell 或 CI 里已有名称统一；也可直接使用 `LIGHTDASH_API_KEY` 等，只要 `-H` 里展开的是 PAT 即可。

---

## 环境变量


| 变量                               | 必填  | 说明                                                     |
| -------------------------------- | --- | ------------------------------------------------------ |
| `LIGHTDASH_SITE_URL`             | 是   | Lightdash 站点根 URL（无尾斜杠亦可）                              |
| `LIGHTDASH_DEFAULT_PROJECT_UUID` | 是   | 默认项目 UUID；未在工具里传 `projectUuid` 且未执行 `set_project` 时的回退 |
| `LIGHTDASH_API_KEY`              | 否   | 默认 PAT；可被 MCP 请求头 `x-api-key` 或工具参数 `apiKey` 覆盖        |
| `LIGHTDASH_MAX_LIMIT`            | 否   | 查询类接口的 `limit` 上限                                      |
| `LIGHTDASH_MCP_HTTP_PORT`        | 否   | HTTP 端口，默认 `3333`                                      |


---

## 鉴权与请求头

### Personal Access Token（PAT）

所有对 Lightdash 后端的出站请求均使用：

`Authorization: ApiKey <token>`

**Token 解析顺序**（后者覆盖前者）：MCP HTTP 请求头 `x-api-key` → 工具入参 `apiKey` → 环境变量 `LIGHTDASH_API_KEY`。未解析到任何 token 时，需要 PAT 的工具会报错。

本服务不实现 MCP OAuth；身份以 PAT 对应用户及主站 CASL 为准。

### X-Lightdash-User-Attributes（可选）

在连接本 MCP 的 HTTP 客户端上设置该请求头时，服务在校验后会把**原始字符串**附加到对 Lightdash 的 `fetch` 上。

- 值须为可被 `JSON.parse` 解析的 JSON（任意合法 JSON 类型均可）。
- 长度超过 `**MAX_USER_ATTRIBUTES_HEADER_CHARS`（当前为 32768）** 或解析失败时，**丢弃该头且不报错**，请求仍用 PAT 继续。

行级安全、属性类策略等语义与主站一致，前提是主站 API 支持该头。

---

## 工具与提示词一览

### 标准工具（16 个）

`get_lightdash_version` · `list_projects` · `set_project` · `get_current_project` · `list_agents` · `set_agent` · `clear_agent` · `get_current_agent` · `list_explores` · `find_explores` · `find_fields` · `find_content` · `list_verified_content` · `search_field_values` · `run_sql` · `run_metric_query`

说明要点：

- `get_lightdash_version`：首条返回内容为短 **version** 文本（无则 `unknown`），第二条为完整 health JSON。
- `run_metric_query`：首条为 **CSV**，第二条为 JSON；响应中含 `**structuredContent`**，便于支持结构化消费的客户端。
- `find_explores` / `find_fields`：对 `dataCatalog` 返回的条目附加 `**heuristicScore**` 并按其降序排列；响应含 `**heuristicRankingVersion**`（当前为 `1`）。

### 扩展工具（4，仅以下 `lightdash_*`）


| 工具名                         | 用途                                          |
| --------------------------- | ------------------------------------------- |
| `lightdash_get_site_info`   | 返回 `siteBaseUrl`（与 `LIGHTDASH_SITE_URL` 一致） |
| `lightdash_list_spaces`     | 列出当前项目下的空间                                  |
| `lightdash_get_saved_chart` | 按图表 UUID 拉取已保存图表定义（含 `webUrl`）              |
| `lightdash_run_saved_chart` | 按已保存图表 UUID 执行查询                            |


### 提示词

- `**lightdash-analyst**`：固定分析师说明；若会话中执行过 `set_agent`，会在提示中附加当前 Agent 的 JSON 快照。

---

## 与主站内置 MCP 的差异


| 维度                              | 主站内置 MCP               | 本包（独立服务）                                                            |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| 部署                              | 随 Lightdash 进程         | 独立 Node 进程                                                          |
| 传输                              | 由主站提供                  | Streamable HTTP（`/mcp`）                                             |
| 会话上下文                           | 主站持久化（如 `mcp_context`） | `set_project` / `set_agent` 仅存**本进程内存**（按 PAT 哈希隔离）                 |
| `find_explores` / `find_fields` | 主站内置实现                 | **dataCatalog** REST；结果含 `heuristicScore`、`heuristicRankingVersion` |
| User-Attributes                 | 由主站入口注入                | 由 **MCP 客户端 HTTP 头** 注入并转发                                          |


---

## Enterprise 与 `aiAgents`

`list_agents`、`set_agent`、`get_current_agent` 及部分与 EE 相关的路由依赖 **Enterprise** 与主站配置。纯 OSS 或未开通相关能力时可能返回 **404**；扩展工具中的读图/跑数仍走常规 REST，以实际部署为准。

---

## 构建

```bash
pnpm -F @lightdash/mcp build
pnpm -F @lightdash/mcp test
```

## Docker

```bash
docker build -f packages/lightdash-mcp/Dockerfile -t lightdash-mcp:0.1.0 .

docker run --rm -p 3333:3333 \
  -e LIGHTDASH_SITE_URL="https://your-lightdash.example.com" \
  -e LIGHTDASH_DEFAULT_PROJECT_UUID="your-project-uuid" \
  -e LIGHTDASH_MCP_HTTP_PORT=3333 \
  lightdash-mcp:0.1.0
```

CI 推阿里云时镜像为 **`registry.cn-hangzhou.aliyuncs.com/winwin/lightdash-mcp:<版本>`**，发布线同时打 **`:latest`**；打 Git tag **`mcp-vX.Y.Z`** 触发（详见 `docs/mcp/lightdash-mcp-docker-deploy.md`）。

若客户端始终在请求里带 `x-api-key`，容器内可不设 `LIGHTDASH_API_KEY`；需要服务端默认 PAT 时再挂载该环境变量。

---

## 常见排障（含 422）

- **422**：多为请求体验证失败；权限问题更常见 **401 / 403**。
- `**run_metric_query`**：`parameters` 传 JSON **对象**，不要传字符串形式的 `"{}"`。
- `**context`**：须为 Lightdash 支持的枚举（如 `mcp`），不要传自然语言描述。
- 过滤条件依赖 `**lightdash.user.email**` 时，请使用当前 PAT 用户的邮箱；主邮箱未验证时可能为空。

---

## 相关仓库与文档

- 技能与示例：`packages/lightdash-skills`
- 总览：`[docs/lightdash-mcp.md](../../docs/lightdash-mcp.md)`
- 分析师向说明：`[docs/lightdash-mcp-user-oriented-tools.md](../../docs/lightdash-mcp-user-oriented-tools.md)`
- Docker 部署：`[docs/mcp/lightdash-mcp-docker-deploy.md](../../docs/mcp/lightdash-mcp-docker-deploy.md)`

## 可执行入口

- npm bin：`lightdash-mcp-http` → `dist/http.js`

