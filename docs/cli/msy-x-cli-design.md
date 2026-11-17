# msy-x-cli（MCP 命令行客户端）设计稿

> 状态：**已实现 · 待发布**（代码在 `feat/msy-x-cli`，2026-11-17 落地；公开发布与真实站点验收待做）。实现顺序、测试与发布见 [开发计划](./msy-x-cli-dev-plan.md)。
>
> 契约来源：豆包《Plugin / 连接器 / MCP Apps 接入指南》第 3–4 章「Plugin 交付规范 / CLI 连接器」（本地文档）+ 本仓 26 个 MCP 工具契约（[DEV_TOOL_NAMES.md](../../packages/lightdash-mcp/DEV_TOOL_NAMES.md)、[MCP v2 接入指南](../mcp/mcp-v2-guide.md)）。
>
> 产物：`packages/msy-x-cli`，npm 包名 `msy-x-cli`，可执行名 `msy-x`。

---

## 1. 摘要与范围

### 1.1 一句话

一个跑在终端里的 **MCP 客户端**：子命令即 MCP 工具，`msy-x` 只负责「取凭证 → 调 `/api/v1/mcp` → 渲染结果」，不做自己的业务实现。

### 1.2 三类用户

| 用户 | 用法 | 关键要求 |
|---|---|---|
| 人（分析师 / 交付） | 终端交互查数、看看板、核对字段值 | 表格输出、可读错误、`webUrl` 直达 |
| 智能体（Claude Code / Codex / 自研 agent） | 非交互 shell 里跑命令、读 JSON | 非 TTY 默认 JSON、稳定退出码、无交互等待 |
| 豆包 CLI 连接器 | 平台按 `cli.json` 安装并调用 | `--version` / `auth login` / `auth status` / `auth logout` / `--help` 五个契约命令 |

### 1.3 在范围内

- 26 个 MCP 工具的**任务化命令** + 一个 `call` 逃生口（新工具无需等 CLI 发版）。
- OAuth（DCR + PKCE）与 PAT 双鉴权；多站点 profile。
- 稳定输出契约与退出码；豆包 `com.doubao/cli.json` 与配套 Skill。

### 1.4 不在范围内

- 任何写操作（MCP 目前 26 个工具全为 `mcp:read`）。
- 复制语义层 / 权限逻辑：口径、看板门控、行级权限一律以服务端为准。
- 看板 / 图表的 as-code 上传下载（属 `@lightdash/cli`，见 [内容即代码计划](./content-as-code-dev-plan.md)）。
- 分平台二进制安装包、自动升级、遥测。

---

## 2. 定位与命名

### 2.1 名字

| 候选 | 结论 |
|---|---|
| `lightdash-cli` / bin `lightdash` | ❌ 与已有 `@lightdash/cli`（[`packages/cli`](../../packages/cli/package.json)，bin `lightdash`）撞名，且受众不同（dbt 部署 / as-code） |
| `msy-cli` / bin `msy` | ❌ 太泛，会与马上赢其他产品线混 |
| **`msy-x-cli` / bin `msy-x`** | ✅ 与「马上赢 X 平台」、`mcp-x.brandct.com` 品牌一致；内部站日后可另出 `msy-inner` |

### 2.2 与既有件的关系

| 既有件 | 关系 |
|---|---|
| `packages/lightdash-mcp`（v1 独立包，弃用中） | **CLI 不支持 v1 专有语义**（session、容量错误码）。仅保留 `--mcp-url` + `--auth-header x-api-key` 逃生口。见 [去留评估](../mcp/lightdash-mcp-retirement-evaluation.md) |
| 主站内置 MCP v2（`/api/v1/mcp`） | **唯一默认目标**。无状态、逐请求鉴权、PG 持久化默认项目 |
| `@lightdash/cli` | 不修改、不复用代码（依赖差异大，避免与上游合并冲突） |
| `packages/x-doubao-plugin` | 复用其 Plugin 打包脚本；新增 `com.doubao/cli.json` 与 Skill 的 CLI 分支 |
| `packages/lightdash-mcp` 的 MCP SDK | 仅借用同一版本 `@modelcontextprotocol/sdk@1.17.5`（`client` + `client/auth`） |

---

## 3. 架构与依赖边界

### 3.1 分层

```text
msy-x (commander)
  ├─ commands/*        参数解析 → 工具名 + 参数（纯函数，可单测）
  ├─ mcp/client        SDK Client + StreamableHTTPClientTransport 封装
  │    ├─ auth         OAuthClientProvider 实现（存取 token / 起回环回调 / 拉浏览器）
  │    └─ toolCatalog  tools/list 缓存（仅 tools 命令需要）
  ├─ render/*          structuredContent / CSV → table | json | csv
  └─ config/*          profile、凭证、env 覆盖
```

### 3.2 复用什么、不复制什么

| 层 | 复用 | 说明 |
|---|---|---|
| 协议 / OAuth | `@modelcontextprotocol/sdk@1.17.5` 的 `client/index` 与 `client/auth` | 已提供 `discoverOAuthProtectedResourceMetadata`、`discoverAuthorizationServerMetadata`、`registerClient`（DCR）、`startAuthorization`（PKCE）、`exchangeAuthorization`、`refreshAuthorization`、`OAuthClientProvider`、`UnauthorizedError`。本仓 `packages/lightdash-mcp` 已锁同版本 |
| 命令框架 | `commander`（`@lightdash/cli` 已在用） | 不用 `oclif`（插件式启动慢，豆包每条命令都新起进程） |
| CSV | `csv-parse` | 本仓目前只有 `csv-stringify`；`run_metric_query` 返回 CSV，必须正确解析引号与换行 |

### 3.3 依赖与体积

- 运行依赖：`@modelcontextprotocol/sdk`、`commander`、`js-yaml`、`csv-parse`、`zod`（SDK peer）。
- **不依赖 `@lightdash/common`**：避免 `npm i -g` 拉一个巨型包，也不把 CLI 与平台版本绑死；`--file` 里的 metricQuery 只做最小结构校验（`exploreName` + `dimensions`/`metrics` 数组）。
- Node ≥ 20（`engines` 声明），与 `packages/cli` 的 node20 目标一致。

---

## 4. 配置与凭证

### 4.1 文件位置

| 项 | 值 |
|---|---|
| 配置目录 | `~/.config/msy-x/`（Windows：`%APPDATA%\msy-x\`） |
| 配置文件 | `config.yaml`（目录 `0700`、文件 `0600`） |
| 覆盖 | `MSY_X_CONFIG=/path/to/config.yaml` |
| Windows | 本次不做 ACL 加固，只在文档标注"共享机器请用 `MSY_X_CONFIG` 指到个人目录" |

### 4.2 结构

```yaml
currentSite: x
sites:
  x:
    mcpUrl: https://x.brandct.com/api/v1/mcp
    authMode: oauth        # oauth | pat
    authHeader: authorization   # authorization | x-api-key（v1 逃生口）
  inner:
    mcpUrl: https://lightdash.banmahui.cn/api/v1/mcp
    authMode: pat
    authHeader: authorization
auth:
  x:
    mode: oauth
    clientId: ...
    clientSecret: ...        # DCR 目前返回 confidential client，必须保存
    redirectUri: http://127.0.0.1:53721/callback
    accessToken: ...
    accessExpiresAt: 2026-11-16T12:00:00.000Z
    refreshToken: ...
    scope: mcp:read
  inner:
    mode: pat
    pat: ldpat_...
```

### 4.3 环境变量（只读覆盖，不写回文件）

| 变量 | 作用 |
|---|---|
| `MSY_X_SITE_URL` | 覆盖 `mcpUrl`（自动拼 `/api/v1/mcp`） |
| `MSY_X_MCP_URL` | 直接覆盖 `mcpUrl`（整条 URL） |
| `MSY_X_PAT` | 用 PAT 鉴权，跳过文件里的 OAuth 凭证 |
| `MSY_X_ACCESS_TOKEN` | 直接给 OAuth access token（CI 用） |
| `MSY_X_NO_BROWSER` | `1` 时只打印授权 URL，不拉浏览器（headless / 服务端验证） |
| `MSY_X_TIMEOUT_MS` | 单次工具调用超时，默认 `60000` |
| `MSY_X_DEBUG` | `1` 时把请求/响应摘要打到 stderr（凭证已脱敏） |

### 4.4 凭证安全

- 统一 `redact()`：`ldpat_[A-Za-z0-9]{38}`、`access_token`、`refresh_token`、`client_secret`、`Authorization` 头一律按键名与模式双重屏蔽，`--verbose` / `--debug` 也走它。
- 不提供 `--print-token`；`auth status` 只输出 `expiresAt` 与 `scope`。
- 刷新加文件锁 `~/.config/msy-x/refresh.lock`（`O_EXCL` + 30s 过期），避免并发命令重复刷新导致 refresh token 失效。

---

## 5. 鉴权契约

### 5.1 OAuth（默认，品牌站 x）

```text
msy-x auth login
  → 生成 state（32B）+ PKCE verifier/challenge(S256)
  → 无 clientId 时 POST {site}/api/v1/oauth/register（client_name=msy-x-cli，
     redirect_uris=[http://127.0.0.1:<随机端口>/callback]，scope=mcp:read）
  → 起本机回环监听（仅 127.0.0.1，单次回调，收到 code/error 后立即关闭）
  → 拉系统默认浏览器到 {site}/api/v1/oauth/authorize?...（失败则打印 URL 继续等待）
  → 校验回传 state（不一致立即失败，不换 token）
  → POST {site}/api/v1/oauth/token（code + code_verifier + client_id/secret）
  → 落盘 access/refresh/expiresAt，stdout 输出成功 JSON，退出码 0
```

- **阻塞语义**：只有拿到终态（成功 / 拒绝 / 过期 / 超时，默认 300s）才退出；绝不等待 stdin / 回车，绝不因"浏览器已打开"提前返回 0。
- **失败不写盘**：任何失败路径都不产生半截凭证。
- **日常调用**：遇 401 时静默 refresh 一次并重试原请求；refresh 失败则清空该站点凭证并退 `3`（提示重新 `auth login`）。
- **未来兼容**：若后端改为 public client（`token_endpoint_auth_methods_supported` 含 `none`），DCR 返回什么就用什么，`clientSecret` 为空时不发送。

### 5.2 PAT（内部站 / CI）

- `msy-x auth login --token ldpat_...`（或 `MSY_X_PAT`）直接落盘 `mode: pat`。
- 出站头：v2 为 `Authorization: ApiKey <pat>`；`--auth-header x-api-key` 仅供 v1 逃生口。

### 5.3 三条契约命令

| 命令 | stdout | 退出码 |
|---|---|---|
| `msy-x auth login` | 成功单行 JSON：`{"logged_in":true,"site":"x","authMode":"oauth","mode":"login"}` | `0` 成功；`2` 参数/本地错误；`3` 授权失败/超时；`6` 网络 |
| `msy-x auth status` | 单行 JSON，`logged_in` **必须是首键**：`{"logged_in":true,"site":"x","authMode":"oauth","expiresAt":"..."}` / `{"logged_in":false,...}` | 已登录 `0`、未登录 **也 `0`**（靠 `logged_in` 区分）、本地读失败 `2` |
| `msy-x auth logout` | `{"logged_out":true,"site":"x"}` | 幂等 `0`；本地写失败 `2` |

- `auth status` **纯本地、离线**判定：凭证存在且（access 未过期 或 有 refresh token）即 `logged_in: true`。这样"断网"不会被豆包判成状态检查失败。
- 真实可用性验证放 `msy-x doctor --remote`（打一次 `tools/list`）。
- 豆包侧正则：`statusMatchRegex = "\"logged_in\"\\s*:\\s*true"`。

---

## 6. 命令面

### 6.1 全局选项

`--site <name|url>`、`--project <uuid>`、`--json` / `--table` / `--csv`、`--envelope`、`--out <path>`、`--timeout <ms>`、`--mcp-url <url>`、`--auth-header <authorization|x-api-key>`、`--config <path>`、`--dry-run`、`--raw`、`--verbose`、`--quiet`。

### 6.2 命令 ↔ 工具映射（26/26）

| 命令 | MCP 工具 | 真实入参 |
|---|---|---|
| `msy-x info` | `get_site_info` + `get_lightdash_version` + `get_current_project` | 均无参 |
| `msy-x access [--explores]` | `get_my_access` | `{ projectUuid?, includeExplores? }` |
| `msy-x project list` | `list_projects` | 无参（v2 无 `full`） |
| `msy-x project use <uuid>` | `set_project` | `{ projectUuid }`，写**服务端**默认项目（PG） |
| `msy-x project show` | `get_current_project` | 无参；`source` ∈ `argument`/`user_default`/`organization_default`/`server_default` |
| `msy-x explores list [--search <q>]` | `list_explores` | `{ exploreName?, page?, pageSize? }`（过滤键是 `exploreName`；`pageSize` 默认 **25**、上限 100） |
| `msy-x explores show <name>` | `find_explores` | `{ exploreName（**必填**）, catalogTags?, projectUuid? }`；v2 语义是「看指定表详情」，**不是**关键词搜表 |
| `msy-x fields find <q> --explore <name>` | `find_fields` | `{ table（必填）, fieldSearchQueries: [{ label }]（必填）, catalogTags?, page? }`；无 `pageSize`（服务端固定 15） |
| `msy-x values <fieldId> [--table <t>] [--search <s>]` | `search_field_values` | `{ table（必填）, fieldId（必填）, query?, filters?, dashboardUuid? }`；无 `limit`（服务端固定 100） |
| `msy-x search <q> [--type chart\|dashboard\|space]` | `find_content` / `find_charts` / `find_dashboards` / `find_spaces` | `{ searchQueries: [{ label: q }], page?, pageSize?(1..100, 默认 50), full? }`；无 `--type` 走 `find_content` |
| `msy-x spaces list [--page n] [--page-size n] [--full]` | `list_spaces` | `{ projectUuid?, page?, pageSize?, full? }`；**无层级/`parent` 参数** |
| `msy-x spaces find <q>` | `find_spaces` | `{ searchQueries: [{ label: q }], page?, pageSize?, full? }` |
| `msy-x dashboards list --space <spaceUuid>` | `list_dashboards` | `{ spaceUuid（**必填**）, projectUuid?, page?, pageSize?, full? }`；缺 `--space` 本地退 `2` 并提示改用 `search --type dashboard` |
| `msy-x dashboards find <q>` | `find_dashboards` | `{ searchQueries: [{ label: q }], … }` |
| `msy-x dashboards tiles <uuid>` | `get_dashboard_tiles` | `{ dashboardUuid（必填，UUID 或 slug）, projectUuid? }`；无 `full` |
| `msy-x dashboards run <uuid> [--tile <slug>]` | `run_dashboard_tiles` | `{ dashboardUuid, projectUuid?, limit?, valueFormat? }`；**服务端会跑整板**，`--tile` 只在 CLI 侧过滤展示 |
| `msy-x dashboards get <uuid> [--full]`（`code` 保留为别名） | `get_dashboard_code` | `{ dashboardUuid, full?, projectUuid? }`；返回看板定义 JSON（不是 as-code 文本） |
| `msy-x charts list --dashboard <uuid>` | `list_charts` | `{ dashboardUuid（必填）, projectUuid?, full? }` |
| `msy-x charts find <q>` | `find_charts` | `{ searchQueries: [{ label: q }], … }` |
| `msy-x charts get <uuid> [--full]` | `get_saved_chart` | `{ savedChartUuid（必填）, projectUuid?, full? }` |
| `msy-x charts run <uuid> [--limit n] [--value-format raw\|formatted] [--dashboard <uuid>]` | `run_saved_chart` | `{ savedChartUuid, projectUuid?, limit?, valueFormat?, dashboardUuid? }`；**无 `full`** |
| `msy-x verified` | `list_verified_content` | `{ projectUuid?, page?, pageSize?, full? }`；响应 `supported:false` 时按成功退 `0` |
| `msy-x query --file q.json` | `run_semantic_metric_query` | **v2 不收 `metricQuery`**：CLI 本地把 Explorer JSON 翻译成 `{ exploreName, metrics, dimensions, filters: { dimensions: [{ fieldId, operator, values }], metrics: [] }, limit, valueFormat }` |
| `msy-x query -e <explore> --dimensions … --metrics …` | `run_semantic_metric_query` | 同上，由 CLI 组装扁平参数 |
| `msy-x query flat -e <explore> --dimensions … --metrics …` | `run_metric_query` | `{ vizConfig: { exploreName, metrics, dimensions, sorts: [{ fieldId, descending }], limit }, filters?, dashboardUuid? }`；`filters` 每条 rule 必带 `fieldType` + `fieldFilterType` |
| `msy-x docs [topic] [--text]` | `get_mcp_docs` | `{ topic?（**自由字符串**，非枚举）, format? }`；推荐值 overview/query_workflow/content_fields/session_lifecycle/security |
| `msy-x tools list [--verbose]` / `tools describe <name>` | `tools/list`（本地展示） | 新工具自动可见 |
| `msy-x call <tool> [--json '<obj>' \| --file <path>]` | 任意 `tools/call` | 兜底通道，未知工具直接透传 |

> 入参名以服务端 schema 为准（来源：`packages/backend/src/services/McpService/tools/**` 与 `packages/common/src/schemas/mcp/**`）。**MCP SDK 会静默丢弃未知键**，键名写错不会报「未知参数」，而是报某必填项缺失——所以命令层必须是严格映射，不允许把 CLI flag 名直接当入参名。

### 6.3 参数约定

- 维度/指标用逗号分隔，可重复：`--dimensions cls_4,mon --metrics total_amount`.
- 过滤器（`query`，语义查询）：`--filter fieldId=value`（可重复，多值 `a,b`）→ `filters.dimensions: [{ fieldId, operator: 'equals', values: [...] }]`；复杂条件用 `--filters-json '<json>'`。
- 过滤器（`query flat`，vizConfig）：每条 rule 必须带 `fieldType` + `fieldFilterType`，CLI 无法从 `fieldId=value` 推出 → `--filter` 不支持，只能用 `--filters-json` 传完整 rule；否则引导改用 `query`。
- 排序：`--sort fieldId:asc|desc`（可重复）；`query flat` 映射到 `vizConfig.sorts[].descending`。
- `--limit`：默认 500，受服务端 `LIGHTDASH_MAX_LIMIT` / `ai.copilot.maxQueryLimit` 封顶；`--page-size` 上限 100，本地截断并在 stderr 告警。
- `projectUuid` **总是可以传**：非强制看板模式下服务端会丢弃未知键（不报错），强制看板模式下它是门控依据；本地不缓存项目，直接用服务端四级兜底链。
- 所有命令 `--help` 必须带一条**真实可跑**的示例（取自 `docs/mcp/马上赢 X 平台 MCP 上手指南.md` 的 `pinleibaohsm_*` / `cls_insight_*`）。
- 例外：文档里没有公开真实 UUID 的命令（`charts get/run` 的 `<chartUuid>`、`dashboards list --space` 的 `<spaceUuid>`）用占位符 + 注释给获取路径（如 `# 先由 msy-x charts find 获取`），**不得**拿看板 UUID 冒充 chart/space UUID。
- `--dry-run` 打印将要发送的 `{tool, arguments}`，不发请求（豆包/agent 排障与单测都用它）。
- `--file -` 从 stdin 读；仅在 stdin 非 TTY 时允许，避免挂死。

---

## 7. 输出契约

### 7.1 流分离

- **stdout 只有数据**；进度、提示、警告、错误一律走 stderr。豆包与 agent 只解析 stdout。
- 颜色仅在 stdout/stderr 为 TTY 且未设 `NO_COLOR` 时启用。

### 7.2 格式选择

1. 显式 `--json` / `--table` / `--csv` 优先；
2. 否则 `process.stdout.isTTY ? table : json`；
3. `--csv` 仅对数据类命令（`query`、`query flat`、`charts run`、`dashboards run`）有效，其余命令报参数错（退 `2`）。

### 7.3 JSON 形态

- 默认：原样输出工具返回的数据体（**优先 `structuredContent`，没有则用 `content[].text` 解析出的 JSON**）。
- 现实口径：v2 的 26 个工具里，**只有看板门控阻断 payload 带 `structuredContent`**；其余 25 个都是 `content[0].text` 里的 JSON 文本（`run_metric_query` 例外，是 CSV；`find_explores`/`find_fields` 是 XML 片段；`search_field_values` 是 ```json 围栏）。
- `--envelope`：`{"ok":true,"tool":"run_semantic_metric_query","data":{…},"meta":{"site":"x","projectUuid":"…","durationMs":812}}`。

### 7.4 渲染源

1. `structuredContent`；
2. `content[].text` 以 `{`/`[` 开头 → `JSON.parse`；
3. ```json / ``` 围栏 → 剥围栏后 `JSON.parse`；
4. 表头+逗号的行 → 按 CSV 解析（`run_metric_query`）；
5. `<` 开头的 XML 片段（`find_explores`/`find_fields`）→ 原样按文本展示，表格模式下退回 `--json` 提示；
6. 全部失败：退 `7`，`--raw` 时把原始响应打到 stderr 便于排查。

### 7.5 表格

- ASCII（`+ - |`），列宽按内容裁剪（单列上限 40 字符，终端宽度不足时按 `--quiet` 规则裁列）。
- 行尾输出 `rows: N` 到 stderr（`--quiet` 关闭）。
- 结果里若有 `webUrl`，作为最后一列；没有则不占位。
- `--out <path>` 时文件写 JSON/CSV，stdout 只输出 `{"written":"/abs/path","rows":N,"bytes":M}`。

---

## 8. 错误与退出码

### 8.1 错误输出（stderr，单行 JSON）

```json
{"error":{"code":"AUTH_REQUIRED","message":"未登录或凭证已失效","hint":"运行 msy-x auth login 重新登录"}}
```

`code` 英文稳定（供 agent 分支判断），`message` / `hint` 中文（供人读）。

可选第三个字段 `detail`：仅当服务端返回结构化载荷时出现（目前是看板门控五类），承载 `action` / `candidates` / `contact` / `dashboardUrl` / `detail` 中原样存在的字段；无载荷时该键整体省略：

```json
{"error":{"code":"dashboard_selection_required","message":"该表关联多张看板…","hint":"…\n- d54853b1-… 品类宝（HSM）\n重试时用 --dashboard <uuid>","detail":{"action":"select_dashboard","candidates":[{"dashboardUuid":"d54853b1-…","dashboardName":"品类宝（HSM）"}]}}}
```

### 8.2 退出码

| 码 | 含义 | 触发 |
|---|---|---|
| `0` | 成功（含 0 行结果） | — |
| `2` | 用法 / 参数 / 本地配置错误 | 非法 flag、坏 YAML、格式命令不适用 |
| `3` | 未登录 / 401 | 无凭证、access+refresh 均失效 |
| `4` | 无权限 / 被门控 | 403、`ForbiddenError`、`dashboard_*` 五类看板门控 |
| `5` | 服务端 / JSON-RPC 错误 | 5xx、MCP error、工具内部报错 |
| `6` | 网络 / 超时 | DNS、连接失败、超时 |
| `7` | 结果解析失败 | 无结构化内容且 CSV 解析失败 |

### 8.3 看板门控（`MCP_DASHBOARD_STRICT=true` 的 x 站）

服务端返回的 `status` **原样进入 `error.code`**（不是被压成统一的 `DASHBOARD_STRICT`），`exitCode` 固定 `4`；`message`/`hint` 用服务端中文文案，结构化载荷放进 `error.detail`：

| 服务端 status | 退出码 | CLI 行为 |
|---|---|---|
| `dashboard_permission_required` | `4` | `hint` 附服务端 `contact`（如 `MCP_DASHBOARD_CONTACT`）；`detail` 带 `action`/`dashboardUrl` |
| `dashboard_configuration_required` | `4` | 提示看板未配置 |
| `dashboard_selection_required` | `4` | `hint` 直接列出候选（`dashboardUuid` + 名称）并提示 `--dashboard`；`detail.candidates` 同数据可机读 |
| `dashboard_not_found` | `4` | 提示先 `dashboards find` |
| `dashboard_context_unavailable` | `4` | 打印服务端原因 |

---

## 9. 豆包 CLI 连接器契约

### 9.1 `com.doubao/cli.json`

位置：`packages/x-doubao-plugin/plugin/com.doubao/cli.json`；连接器键 `msy-x`（**不得**与同包 MCP 服务键 `x` 重名）。

```json
{
  "connectors": {
    "msy-x": {
      "install": {
        "default": ["npm install -g https://<public-host>/msy-x-cli/msy-x-cli-0.1.0.tgz"]
      },
      "versionCheck": { "default": ["msy-x --version"] },
      "statusMatchRegex": "\"logged_in\"\\s*:\\s*true",
      "auth": { "default": ["msy-x auth login"] },
      "unAuth": { "default": ["msy-x auth logout"] },
      "status": { "default": ["msy-x auth status"] },
      "help": { "default": ["msy-x --help"] }
    }
  }
}
```

规则核对（来自指南 §4.1）：

- `install` 必填；平台键用 `linux` / `darwin` / `win32` / `default`，至少含 `linux` 或 `default`；Linux 选中项**只能是 npm 安装命令**（当前用 `default`，全平台同一 npm 命令）。
- 每条命令数组不得为空；`install` 按顺序执行，任一失败即安装失败。
- ZIP 内**不含** CLI 二进制、`client_id`、`client_secret`、真实令牌。
- 拿到 npm 账号后，`install.default` 只改一行为 `npm install -g msy-x-cli`（或 `--registry https://registry.npmjs.org`）。

### 9.2 平台/运行时自检（提交材料用）

| 问卷字段 | 本产品填写 |
|---|---|
| 安装方式 | 命令安装（npm） |
| Runtime 及最低版本 | Node.js ≥ 20 |
| 可执行文件名 | `msy-x` |
| 版本检查 | `msy-x --version`（输出 `msy-x <semver>` 单行） |
| 是否需要登录 | 需要 |
| 登录命令 | `msy-x auth login`（非交互启动、自动拉浏览器、阻塞至终态） |
| 登录状态检查 | `msy-x auth status`（JSON，`logged_in` 首键） |
| 状态正则 | `"logged_in"\s*:\s*true` |
| 登出命令 | `msy-x auth logout` |
| 帮助命令 | `msy-x --help`（无副作用） |
| 远程依赖 | `x.brandct.com`（MCP + OAuth authorize/token/register）、npm 源或 tgz 托管域名 |
| 升级方式 | `npm install -g` 覆盖安装；发版以 npm 版本或 tgz 路径为准 |

### 9.3 配套 Skill

- 复用单一顶层 Skill：`plugin/skills/brandct-x-insight/`（不新增第二个顶层技能，避免触发冲突；豆包上限 5 个）。
- 新增 `references/cli.md`，写清：适用任务、命令与参数、`--json` 输出字段、退出码表、未安装/未登录/无网络/命令失败的处置、`webUrl` 直达。
- `SKILL.md` 增加「CLI 通道」小节与路由规则（有 CLI 用 CLI；只有 MCP 连接器时走原路径）。

### 9.4 双通道并存

Plugin 内同时保留 `mcp.json`（MCP 连接器 `x`）与 `cli.json`（CLI 连接器 `msy-x`）。提交审核前按运营要求裁剪为单连接器：

- 只留 CLI：删除 `mcp.json` 与 `plugin.json` 里的 `extensions["com.doubao"].mcpServers`。
- 只留 MCP：删除 `com.doubao/cli.json` 与 `references/cli.md` 的对应章节。

`packages/x-doubao-plugin/scripts/verify.mjs` 增加上述两类一致性检查。

---

## 10. 兼容与边界

### 10.1 协议与站点

- 默认只打 v2 `/api/v1/mcp`（无状态、无 `Mcp-Session-Id`）。
- v1 逃生口：`--mcp-url http://host:3333/mcp --auth-header x-api-key`；不实现 v1 的 session/容量语义，遇到 404 会话错误直接报错并提示改用 v2。
- `packages/lightdash-mcp` 的去留按 [去留评估](../mcp/lightdash-mcp-retirement-evaluation.md) 方案 C：文档口径已切 v2 → 观察调用量 → 退役；**CLI 不为 v1 增加维护成本**。

### 10.2 超时与体量

- 单次工具调用默认 60s，`--timeout` 可到 600s；超时退 `6` 并在 stderr 提示"查询可能仍在服务端执行"。
- 默认 `--limit 500`；服务端 `LIGHTDASH_MAX_LIMIT` 更小时以服务端为准（CLI 不自行截断数据，只提示）。
- 大结果建议 `--out file.csv`：明细落盘、stdout 只回摘要，避免灌满终端/上下文。

### 10.3 安全

- 不回显凭证、不写日志文件；`--verbose` 输出请求头前先 `redact()`。
- 回环回调只绑 `127.0.0.1`、随机端口、单次、校验 `state`，完成后立即 `server.close()`。
- 不改写工具入参（`call` 原样透传）；**唯一例外**是 `query --file`：v2 不收 `metricQuery`，CLI 必须把它翻译成扁平参数，翻译规则固定在 `commands/query.ts` 并配单测，不允许静默丢字段（未知字段进 `--dry-run` 输出并 stderr 告警）。

### 10.4 服务端缺陷（已确认并已修复，需随主站发布）

**先分清责任边界**：这是**服务端**（本仓 `packages/backend` 的 MCP 服务）的 bug，**改 CLI 修不了**。

- `McpService.getMcpCompatibleSchema()` 把 AI schema 的 `type` 判别键从下发给客户端的 inputSchema 里剥掉（注释："MCP clients should not have to send it"）；
- SDK 用该 shape 校验后，会把客户端**硬塞的** `type` 当未知键丢弃（已验证：客户端带上 `type` 后，交给 handler 的键里没有 `type`）；
- 但 `run_metric_query` / `search_field_values` 的 handler 直接复用 AI 侧共享实现（`runRunMetricQuery` / `runSearchFieldValues`），那两份实现用**含必填 `type` 的原始 schema** 再 parse 一次 → `invalid_literal: expected "run_metric_query"`。

所以只有两个选项：（a）修服务端（已选）；（b）CLI 完全不用这两个工具（改走 `run_semantic_metric_query`，但 `values` 没有等价替代）。

**已确认**（本仓可复现）：按 MCP 真实链路模拟（compat layer 处理 → 剥 `type` → SDK parse → handler 二次 parse），handler 阶段只剩 `type: Invalid literal value`；`customMetrics`/`tableCalculations`/`filters`/`query` 不受影响（compat layer 把 nullable 变成「可选 + 缺省补 null」）。

**已修复**（同一分支）：`packages/backend/src/services/McpService/mcpToolArgs.ts` 新增 `withToolDiscriminator()`，两个透传调用点补回判别键；回归测试 `mcpToolDiscriminator.test.ts`（含源码级守门）。v1 独立包 `packages/lightdash-mcp` 自带 handler，不受影响。

**与 CLI 发布的关系**：CLI **尚未对外发布**，不需要兼容窗口，也不长期背「实验」标注。发布门禁两条：

1. 目标站点镜像 ≥ 含该修复的版本（否则 `run_metric_query` / `search_field_values` 必定失败）；
2. 发布前用真实站点跑一次 `msy-x call search_field_values '{"table":"…","fieldId":"…"}'` 与 `msy-x query flat …` 冒烟，确认后去掉「实验」标注。

**若真撞上未升级的镜像**：CLI 会把服务端的 `Invalid literal value` 归一为 `SERVER_ERROR(5)` 并附可执行 hint（升级主站 / 改用 `msy-x query`），不会把裸 zod 文案扔给用户。

---

## 11. 假设与默认值

1. x 站已部署 v2 MCP（`/api/v1/mcp`）且 `MCP_ENABLED` 开启；OAuth DCR/PKCE/token/refresh 已实现（[`oauthRouter.ts`](../../packages/backend/src/routers/oauthRouter.ts)）。
2. DCR 返回 confidential client（`token_endpoint_auth_methods_supported` 仅 `client_secret_basic|post`）→ CLI 保存 `client_secret`；后端未来支持 `none` 时自动兼容。
3. Access token 1h、Refresh token 2 周、`scope=mcp:read` 覆盖全部 26 个工具。
4. 首发只支持 Node ≥ 20，不出分平台二进制。
5. npm 包名 `msy-x-cli` 需先 `npm view msy-x-cli` 确认；被占用则用 `@banmahui/msy-x-cli`（bin 仍 `msy-x`）。
6. 公网 tgz 托管由运维提供（HTTPS、无鉴权、可直连）；首批用 tgz，拿到 npm 账号后切 npm。
7. 本包为 fork 专有，不提上游 PR；不改 `packages/cli`。

---

## 12. 参考

- 豆包《Plugin / 连接器 / MCP Apps 接入指南》第 3 章（Plugin 交付规范）、第 4 章（CLI 连接器：配置字段、Auth 登录流程、验收、人工接入材料）——本地文档，提交前以最新版为准。
- [MCP v2 接入指南](../mcp/mcp-v2-guide.md)：端点、鉴权、26 工具、项目四级兜底、错误码。
- [MCP 线上地址速查](../mcp/mcp-endpoints.md)：x / 内部 / 预发三套地址与强制看板模式状态。
- [工具与权限对照](../mcp/mcp-tools-permissions.md)、[查询工具速查](../mcp/lightdash-mcp-query-tools-quickref.md)。
- [独立包去留评估](../mcp/lightdash-mcp-retirement-evaluation.md)。
- X 平台上手指南（`docs/mcp/马上赢 X 平台 MCP 上手指南.md`）：真实示例（品类宝 / 品类洞察）；文档索引见 [MCP 文档索引](../mcp/README.md)。
- 代码：`packages/backend/src/routers/oauthRouter.ts`、`packages/lightdash-mcp/DEV_TOOL_NAMES.md`、`packages/x-doubao-plugin/README.md`。
