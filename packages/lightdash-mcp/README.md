# @lightdash/mcp

独立运行的 Lightdash [Model Context Protocol](https://modelcontextprotocol.io) 服务，面向 Claude Code、Cursor 等客户端。通过站点 **REST API** 注册 **19 个 MCP 工具**（**15** 个核心：健康/项目/目录/内容/查询；**4** 个站点与已保存图表相关），以及 **`lightdash-analyst`** 提示词；工具名**统一无前缀**（与 EE 内置 MCP 对齐的仍用上游同名，如 `find_charts`）。不托管在 Lightdash 进程内，适合单独扩缩或与主站版本解耦。

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
| `LIGHTDASH_PROJECT_UUID`         | 否   | MCP 默认项目 UUID；未传时可依赖 **`set_project`** 或各工具可选参数 **`projectUuid`**（见下节） |
| `LIGHTDASH_API_KEY`              | 否   | 默认 PAT；可被 MCP 请求头 `x-api-key` 或工具参数 `apiKey` 覆盖        |
| `LIGHTDASH_MAX_LIMIT`            | 否   | 查询类接口的 `limit` 上限                                      |
| `LIGHTDASH_MCP_HTTP_PORT`        | 否   | HTTP 端口，默认 `3333`                                      |

### 项目 `projectUuid` 解析顺序

对需要项目的工具（含 **`list_spaces`**、**`run_saved_chart`** 与核心工具），有效项目 UUID 按：

1. **本次工具入参** `projectUuid`（若传入非空字符串）  
2. **`set_project`** 写入的会话项目（按 PAT 隔离，内存）  
3. **环境变量** `LIGHTDASH_PROJECT_UUID`

三者皆无时，工具调用会**报错**（进程仍可启动；未配环境默认时属 **fail-late**，部署文档请说明须先 `set_project` 或传参）。

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

### 核心工具（15 个）

`get_lightdash_version` · `list_projects` · `set_project` · `get_current_project` · `list_explores` · `find_explores` · `find_fields` · `find_content` · `find_charts` · `find_dashboards` · `find_spaces` · `list_verified_content` · `search_field_values` · `run_sql` · `run_metric_query`

说明要点：

- `get_lightdash_version`：首条返回内容为短 **version** 文本（无则 `unknown`），第二条为完整 health JSON。
- `find_charts` / `find_dashboards` / `find_spaces`：与上游 EE 内置 MCP 命名对齐，分别固定 `contentTypes` 为 chart / dashboard / space；`find_content` 为**不传类型过滤**的混合关键词搜索。
- `run_metric_query`：首条为 **CSV**，第二条为 JSON；响应中含 `**structuredContent`**，便于支持结构化消费的客户端。
- `find_explores` / `find_fields`：对 `dataCatalog` 返回的条目附加 `**heuristicScore**` 并按其降序排列；响应含 `**heuristicRankingVersion**`（当前为 `1`）。

### 站点与已保存图表（4 个）

与核心工具同一 PAT；在扩展注册顺序上先于核心工具加载，名称无前缀。

| 工具名               | 用途                                          |
| ----------------- | ------------------------------------------- |
| `get_site_info`   | 返回 `siteBaseUrl`（与 `LIGHTDASH_SITE_URL` 一致） |
| `list_spaces`     | 列出当前项目下的空间                                  |
| `get_saved_chart` | 按图表 UUID 拉取已保存图表定义（含 `webUrl`）              |
| `run_saved_chart` | 按已保存图表 UUID 执行查询                            |


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


---

## 构建

```bash
pnpm -F @lightdash/mcp build
pnpm -F @lightdash/mcp test
```

## 版本号与发版（`mcp-v*`）

- **运行时来源**：本包 **[`package.json`](./package.json)** 的 **`version`**（MCP Server 元数据与启动日志从该字段读取）。
- **与 skills 一套发版时**：对外只需**一个 semver**；仓库根执行 **`pnpm bump-mcp-skills -- x.y.z`**，一次写齐 MCP `package.json` 与 `packages/lightdash-skills/version.json`（技能包无 `package.json`）。
- **例外**：只改一侧时用 `node scripts/bump-versions.mjs mcp x.y.z` 或 `node scripts/bump-versions.mjs skills x.y.z`。
- **bump 脚本**：仓库根 **[`scripts/bump-versions.mjs`](../../scripts/bump-versions.mjs)**（改完后自行 `git commit` / 打 tag）。
- **Git tag**：与 CI [`build-docker-mcp.yml`](../../.github/workflows/build-docker-mcp.yml) 一致，推送 **`mcp-v` + 与 `package.json` 相同的版本号**，例如 `mcp-v0.0.3`（镜像 tag 为 `0.0.3` 与 `latest`）；skills 若同号随发，可不再单独打 `skills-v*`，或按需打与 `mcp-v*` 同号以便分发。

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

