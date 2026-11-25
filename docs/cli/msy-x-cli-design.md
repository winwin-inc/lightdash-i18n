# msy-x-cli 设计文档

> 版本对应：0.2.4（扫码登录为 0.2.0 新增、服务端需 ≥ 2.7.5；0.2.4 下线 `verified`）　｜　文档状态：已实现
>
> 本文是自包含的对外契约文档，不依赖任何内部文档或代码路径。使用步骤见同目录《msy-x-cli 使用手册》。

---

## 1. 概述

### 1.1 一句话

`msy-x-cli` 是一个跑在终端里的 **MCP 客户端**：子命令即服务端工具，负责「取凭证 → 调用 MCP 端点 → 渲染结果」，不复制任何业务语义。

### 1.2 三类使用者

| 使用者 | 典型用法 | 关键要求 |
|---|---|---|
| 人（分析师 / 交付） | 交互式查数、看内容、核对字段值 | 表格输出、可读错误、结果可点开 |
| 智能体（Claude Code / Codex / 自研 agent） | 非交互 shell 里执行命令、读结构化结果 | 非 TTY 默认 JSON、稳定退出码、绝不等待交互 |
| CLI 连接器 | 平台按配置安装并调用固定命令 | `--version` / `auth login` / `auth status` / `auth logout` / `--help` 五条契约 |

### 1.3 范围内

- 26 个 MCP 工具的**任务化命令** + 一个任意工具透传通道（新工具无需等 CLI 发版）。
- OAuth（DCR + PKCE）与 Personal Access Token 双鉴权；多站点切换。
- 稳定的输出契约、错误码与退出码；CLI 连接器所需的配置文件说明。

### 1.4 范围外

- 任何写操作（对端工具集当前均为只读）。
- 语义层建模、权限实现、看板/图表的内容管理与发布。
- 分平台二进制安装包、自动升级、客户端遥测。

---

## 2. 命名与定位

| 候选 | 结论 |
|---|---|
| `lightdash-cli` / bin `lightdash` | 不采用：与已有 dbt 开发者 CLI 重名，受众也不同 |
| `msy-cli` / bin `msy` | 不采用：语义过泛，无法体现平台归属 |
| **`msy-x-cli` / bin `msy-x`** | 采用：与「马上赢 X 平台」品牌一致；内部环境以后可另发子品牌包 |

与既有工具的关系：

- 与 **MCP 服务**：CLI 只调用服务端的 `/api/v1/mcp` 端点，工具名、入参、权限、口径全部以服务端为准。
- 与 **dbt 部署 CLI**：互不依赖、互不复用代码；后者管语义层部署与内容即代码。
- 与 **MCP 连接器**：两条并行通道（MCP / CLI），能力同源，用户按客户端支持情况二选一。

---

## 3. 架构与依赖

### 3.1 分层

```text
msy-x
├── commands/*      参数解析 → {tool, args}（纯函数，可单测）
├── mcp/*           SDK Client + Streamable HTTP 封装；错误归一
├── auth/*          OAuth(DCR+PKCE) / PAT / 刷新 / 登出
├── render/*        数据源探测与 table / json / csv 渲染
├── config/*        站点 profile、凭证、环境变量覆盖
└── cli/*           全局选项、执行管道、输出与退出码
```

### 3.2 运行时依赖

| 依赖 | 用途 | 说明 |
|---|---|---|
| Node.js ≥ 20 | 运行时 | `engines` 声明；未提供分平台二进制 |
| `@modelcontextprotocol/sdk` | 协议与 OAuth 客户端 | 负责发现、动态注册、PKCE、换 token、刷新 |
| `commander` | 命令解析 | 轻量、启动快（每条命令都是新进程） |
| `csv-parse` | CSV 解析 | 仅用于确实是 CSV 的工具返回 |
| `js-yaml` / `zod` / `tslib` | 配置、校验、编译期 helper | — |

CLI **不依赖**平台的类型包，避免安装体积与版本耦合；入参不做本地改写（唯一例外见 §7.3 的 `query --file` 翻译）。

### 3.3 协议

- 传输：MCP Streamable HTTP（`POST /api/v1/mcp`，无状态；不返回也不需要 `Mcp-Session-Id`）。
- 握手：标准 `initialize` + `tools/list` + `tools/call`；响应为 JSON。
- 请求头：`Accept: application/json, text/event-stream`（由 SDK 自动携带）。

---

## 4. 安装与分发

| 项 | 值 |
|---|---|
| 包名 / 可执行名 | `msy-x-cli` / `msy-x` |
| 分发形态 | npm 包（tgz），全局安装 |
| 公开地址 | `https://img0.banmahui.cn/msy-x/cli/msy-x-cli/<version>/msy-x-cli-<version>.tgz` |
| 完整性 | 同目录提供 `<tgz>.sha256`（`sha256sum -c` 可校验） |
| 安装 | `npm i -g <tgz 地址>` |
| 升级 | 用新版本地址再执行一次覆盖安装 |
| 卸载 | `npm uninstall -g msy-x-cli` |

对象属性：`Content-Type: application/gzip`、`Cache-Control: public, max-age=31536000, immutable`、匿名可读（`npm install -g` 无法携带签名，因此**不能**使用预签名下载端点分发）。

---

## 5. 配置与凭证

### 5.1 文件位置

| 项 | 值 |
|---|---|
| 默认路径 | `~/.config/msy-x/config.yaml`（Windows：`%APPDATA%\msy-x\`） |
| 权限 | 目录 `0700`、文件 `0600`（非 Windows 生效） |
| 覆盖 | 环境变量 `MSY_X_CONFIG=/path/to/config.yaml` |
| 写入方式 | 原子写（临时文件 + rename），坏文件不会被覆盖 |

### 5.2 结构

```yaml
currentSite: x
sites:
  x:
    mcpUrl: https://x.brandct.com/api/v1/mcp
    authMode: oauth            # oauth | pat
    authHeader: authorization  # 出站鉴权头名：authorization | x-api-key（兼容自定义网关）
  inner:
    mcpUrl: https://lightdash.banmahui.cn/api/v1/mcp
    authMode: pat
    authHeader: authorization
auth:
  x:
    mode: oauth
    clientId: mcp-xxxxxxxx
    clientSecret: xxxxxxxx
    redirectUri: http://127.0.0.1:45397/callback
    accessToken: xxxxxxxx
    accessExpiresAt: 2026-11-17T12:00:00.000Z
    refreshToken: xxxxxxxx
    scope: mcp:read
  inner:
    mode: pat
    pat: ldpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

凭证**按站点隔离**：在一个站点登录不会让另一个站点也登录。

### 5.3 环境变量（只读覆盖，不写回文件）

| 变量 | 作用 |
|---|---|
| `MSY_X_SITE_URL` | 站点根 URL（自动拼 `/api/v1/mcp`） |
| `MSY_X_MCP_URL` | 直接指定完整 MCP URL（优先级更高） |
| `MSY_X_PAT` | 以 PAT 鉴权，覆盖文件内凭证 |
| `MSY_X_ACCESS_TOKEN` | 直接给 OAuth access token（CI 用） |
| `MSY_X_CONFIG` | 配置文件路径 |
| `MSY_X_NO_BROWSER` | `1` 时只打印授权链接，不拉浏览器 |
| `MSY_X_TIMEOUT_MS` | 单次工具调用超时（默认 60000，上限 600000） |
| `MSY_X_DEBUG` | `1` 时等价于 `--verbose` |

站点解析优先级：`--mcp-url` > `--site <url>` > `--site <name>` > `MSY_X_MCP_URL` > `MSY_X_SITE_URL` > 配置 `currentSite`。

### 5.4 凭证安全

- 统一脱敏：令牌模式（`ldpat_` + 38 位）与敏感键名（`token` / `secret` / `pat` / `authorization`）在日志、`--verbose`、`--debug` 中一律替换为 `***`。
- 不提供「打印 token」的命令；`auth status` 只输出 `expiresAt` 与 `scope`；`doctor` 只输出布尔值。
- 刷新加文件锁（`O_EXCL` + 30s 过期），避免并发命令重复刷新导致 refresh token 失效。
- **刷新失败分两类**（0.2.5 起）：服务端明确拒绝 refresh_token（`invalid_grant` / `invalid_client` / `unauthorized_client` / `invalid_scope`）才清空该站点凭证并退 `3`；网络错误、502/503、非 OAuth 错误体（网关 HTML）属**暂时失败**，**保留本地凭证**并退 `6`，提示稍后重试。0.2.4 及更早把两者混为一谈，一次 503 就会把用户登录删掉。
- 写回与清空前都重读配置并与「开始刷新时的快照」比对：磁盘已被并发进程或新登录替换时不动它，避免刷新结果覆盖、或清空动作删掉刚完成的新登录。
- 失败不落盘：任何失败路径都不会留下半截凭证。

---

## 6. 鉴权契约

### 6.1 OAuth（默认）

```text
auth login
  → 生成 state（32 字节随机）+ PKCE verifier/challenge（S256）
  → 无缓存 client 时执行动态注册（RFC 7591）
      client_name = msy-x-cli
      scope       = mcp:read
      redirect    = http://127.0.0.1:<随机端口>/callback
  → 本机回环监听（只绑 127.0.0.1、单次回调、收到即关闭）
  → 打开系统默认浏览器（失败或无桌面时打印授权链接并继续等待）
  → 校验回传 state（不一致立即失败，不换 token）
  → 以 authorization_code + code_verifier + client_secret_post 换取 token
  → 落盘 access/refresh 并输出成功 JSON
```

- **阻塞语义**：只有拿到终态（成功 / 拒绝 / 过期 / 超时，默认 300s）才退出；不读 stdin、不等回车。
- **关键端点**（均相对站点根）：

| 端点 | 用途 |
|---|---|
| `GET /api/v1/mcp`（未授权响应） | 返回 `WWW-Authenticate`，指向受保护资源元数据 |
| `GET /api/v1/oauth/.well-known/oauth-protected-resource` | 受保护资源元数据（资源、授权服务器、支持的 scope） |
| `GET /api/v1/oauth/.well-known/oauth-authorization-server` | 授权服务器元数据（含 `registration_endpoint`） |
| `POST /api/v1/oauth/register` | 动态注册，返回 `client_id` / `client_secret` |
| `GET /api/v1/oauth/authorize` | 授权页（需浏览器内已登录） |
| `POST /api/v1/oauth/token` | 换 token / 刷新 token |
| `POST /api/v1/oauth/revoke` | 登出时尽力吊销 |

- Access token 1 小时、refresh token 2 周；日常调用遇 401 会静默刷新一次并重试。刷新失败按三分法：凭证被服务端否掉（`invalid_grant` 等）→ 清凭证、退 `3`（需重新登录）；网络/5xx 暂时失败 → **保留凭证**、退 `6`（稍后重试即可）；刷新成功但磁盘已被新登录替换 → 用磁盘那份、不覆盖。

### 6.2 Personal Access Token

- 在站点的个人设置中生成（`ldpat_` + 38 位，只显示一次），权限等于该用户本身。
- 出站头：主站用 `Authorization: ApiKey <PAT>`；如网关要求别的头名，用 `--auth-header x-api-key` 切换。
- PAT 不受 OAuth scope 限制（服务端不做 scope 校验）。

### 6.3 三条契约命令

| 命令 | stdout（单行 JSON） | 退出码 |
|---|---|---|
| `msy-x auth login` | `{"logged_in":true,"site":"x","authMode":"oauth","mode":"login"}` | `0` 成功；`2` 参数/本地错误；`3` 授权失败或超时；`6` 网络 |
| `msy-x auth status` | `logged_in` **必须是第一个键**：`{"logged_in":true,...}` / `{"logged_in":false,...}` | 已登录 `0`、未登录**也 `0`**（靠 `logged_in` 区分）、本地读失败 `2` |
| `msy-x auth logout` | `{"logged_out":true,"site":"x"}` | 幂等 `0` |

`auth status` 为**纯本地离线判定**（凭证存在且未过期，或存在 refresh token）；真实可用性由 `doctor --remote` 验证。

为兼容习惯，另外提供两个顶层别名：`msy-x login`（= `auth login`）、`msy-x logout`（= `auth logout`）。别名与规范命令走同一实现，**没有**独立的语义分支；`auth status` 不提供别名（避免与 `doctor` / `info` 混淆）。本地凭证命令不支持 `--dry-run`（会直接报用法错误，而不是静默写盘）。

### 6.4 设备码（扫码）登录

无浏览器环境（WSL / SSH / 容器）用 `msy-x auth login --qr` 走 RFC 8628 设备码流程，与浏览器 OAuth 并存、互不影响。

```text
CLI                                 服务端
 |-- POST /api/v1/oauth/device ----->| 生成 device_code + user_code（10 分钟有效）
 |<-- verification_uri_complete -----| client_id = msy-x-cli（预注册公开客户端）
 |   终端渲染二维码 + 明文 user_code    |
 |   手机扫码 → 确认页点同意 ---------->| GET/POST /api/v1/oauth/device/activate（需登录态）
 |-- POST /api/v1/oauth/device/token->| 轮询换 token（一次性消费）
 |<-- access_token + refresh_token --| 与浏览器 OAuth 同构，refresh 复用
```

| 项 | 契约 |
|---|---|
| 授权端点 | `POST {site}/api/v1/oauth/device`、`GET/POST {site}/api/v1/oauth/device/activate`、`POST {site}/api/v1/oauth/device/token` |
| 公开客户端 | `msy-x-cli`（迁移预注册，`scope=mcp:read`，无 client_secret） |
| 会话存储 | **服务端 Postgres（`oauth2_device_codes`）**，多副本共享；不得依赖进程内存 |
| 有效期 | 设备码 10 分钟；确认页只能用一次；进行中会话上限 1 万，超出 `/device` 返回 429 `slow_down` |
| 轮询 | 服务端 `interval=5`（秒）；CLI 遵守该值，收到 `slow_down` 追加 5s，`interval` 缺失/非法时兜底 5s |
| 会话状态 | `pending` →（用户确认）`authorized` →（CLI 兑换）`consumed`；或 `pending` → `denied`。状态迁移全部用原子 `UPDATE ... WHERE status=...`，并发双批准/双兑换只成功一次 |
| 失败语义 | `authorization_pending` 继续等；`expired_token` / `access_denied` / `invalid_grant` → 退 `3`，凭证不落盘；`server_error`（500，签发环节瞬时故障）与 5xx/网络错误 → CLI 在 deadline 内继续重试，超时后按类别退 `6`（网络）或 `3`（服务端） |
| 签发失败自愈 | 兑换前先把会话标 `consumed`，`createDeviceToken` 抛错则回退为 `authorized`（best-effort）+ 返回 500 `server_error`，下一轮轮询可重试，无需重新扫码 |
| 无浏览器检测 | WSL 且未配置 `$BROWSER`、PATH 中无 `xdg-open`/`wslview` 时自动降级为扫码，并在 stderr 提示 |
| 能力探测 | `msy-x doctor --remote` 的 `device-flow` 项：用未注册 client_id 探 `POST /device`，返回 `400 unauthorized_client` 视为端点存在 |

**部署前提**：服务端镜像 ≥ 2.7.5（2.7.4 首次引入端点，但会话存在进程内存，多副本下扫码约 50% 报 `Invalid Code`）。旧站点上 CLI 报「站点不支持扫码登录（镜像需 ≥ 2.7.5）」或 `invalid_grant`，可用 `--no-browser` 或 `--token <pat>` 绕过。

**确认页文案与登录提示**（v2.7.5+）：确认页、授权页、成功/失败提示页均已中文化（协议错误码如 `invalid_grant` 保持英文，CLI 依赖它们）。确认页验证码下方按站点显示登录方式提示，三层判定：

1. OIDC 端点（`auth.oidc.metadataDocumentEndpoint`）域名含 `weixin`/`wechat`/`dingtalk` → 按身份源直接判定（IdP 直连场景）；
2. 命中内置自建 SSO 映射（`brandct.com` 线上品牌 → 微信、`brand.pre.banmahui.cn`/`brand.banmahui.cn` 品牌预发 → 微信、`admin.banmahui.cn` 内部平台 → 钉钉）→ 按 SSO 背后的登录方式判定；
3. 都不命中 → 通用的「本平台使用扫码方式登录。」

默认零配置；将来 SSO 域名变化可用 `LOGIN_HINT_WECHAT_DOMAINS` / `LOGIN_HINT_DINGTALK_DOMAINS`（逗号分隔，支持子域后缀匹配）覆盖，无需发版。

**已知限制**：

- `POST /device` 与 `POST /device/token` **没有限流**，仅靠「进行中会话 ≤ 1 万」的全局上限（超出返回 429 `slow_down`）。该上限是跨副本共享的单一闸门，持续灌请求可在 TTL（10 分钟）内把真实用户挡在 429。建议在入口网关/Ingress 对 `/api/v1/oauth/device*` 做 IP 级限速；代码内的限流/失败计数属后续工作。
- **微信内置 webview 不能作为可靠的确认入口**（实测预发环境复现）：webview 在 OIDC 跨站跳转链上种植的 session cookie 会随机丢失，导致每次打开确认页都要求重新登录，点「允许」时报 401 `Unauthorized`；一旦某次登录的 cookie 成功落盘则后续复用稳定，表现为「时好时坏」。引导用户：优先 PC 浏览器打开 `verification_uri_complete` 确认；移动端复制链接用系统浏览器（Safari/Chrome）打开；确认页已提示「本平台使用微信扫码登录」。

---

## 7. 命令面

### 7.1 全局选项

`--site <name|url>`、`--project <uuid>`、`--json` / `--table` / `--csv`、`--envelope`、`--out <path>`、`--timeout <ms>`、`--mcp-url <url>`、`--auth-header <authorization|x-api-key>`、`--config <path>`、`--dry-run`、`--raw`、`--verbose`、`--quiet`。全局选项可放在子命令前或后。

### 7.2 命令 ↔ 工具映射（35 条命令 / 26 个工具）

| 命令 | 对应工具 | 真实入参 |
|---|---|---|
| `info` | `get_site_info` + `get_lightdash_version` + `get_current_project` | 均无参 |
| `access [--explores]` | `get_my_access` | `{ projectUuid?, includeExplores? }` |
| `project list` | `list_projects` | 无参 |
| `project use <uuid>` | `set_project` | `{ projectUuid }`（写服务端默认项目） |
| `project show` | `get_current_project` | 无参；返回 `source` ∈ `argument`/`user_default`/`organization_default`/`server_default` |
| `explores list [--search <q>] [--page n] [--page-size n]` | `list_explores` | `{ exploreName?, page?, pageSize? }`（`pageSize` 默认 25、上限 100） |
| `explores show <name>` | `find_explores` | `{ exploreName（必填）, catalogTags? }`（语义是「看指定表详情」，不是关键词搜表） |
| `fields find <q> --explore <name> [--tags a,b] [--page n]` | `find_fields` | `{ table（必填）, fieldSearchQueries: [{ label }]（必填）, catalogTags?, page? }`（服务端固定每页 15） |
| `values <fieldId> --table <t> [--search <s>]` | `search_field_values` | `{ table（必填）, fieldId（必填）, query?, dashboardUuid? }`（服务端固定 100 条） |
| `search <q> [--type chart\|dashboard\|space] [--page n] [--page-size n] [--full]` | `find_content` / `find_charts` / `find_dashboards` / `find_spaces` | `{ searchQueries: [{ label }], page?, pageSize?(1..100, 默认 50), full? }` |
| `spaces list [--page n] [--page-size n] [--full]` | `list_spaces` | `{ page?, pageSize?, full? }`（无层级参数） |
| `spaces find <q>` | `find_spaces` | `{ searchQueries: [{ label }], pageSize? }` |
| `dashboards list --space <spaceUuid>` | `list_dashboards` | `{ spaceUuid（必填）, page?, pageSize?, full? }` |
| `dashboards find <q>` | `find_dashboards` | `{ searchQueries: [{ label }], … }` |
| `dashboards tiles <uuid>` | `get_dashboard_tiles` | `{ dashboardUuid }`（UUID 或 slug；无 `full`） |
| `dashboards run <uuid> [--tile <slug>] [--limit n] [--value-format raw\|formatted]` | `run_dashboard_tiles` | `{ dashboardUuid, limit?, valueFormat? }`；**服务端跑整板**，`--tile` 仅本地过滤展示 |
| `dashboards get <uuid> [--full]`（别名 `code`） | `get_dashboard_code` | `{ dashboardUuid, full? }`；返回看板定义 JSON |
| `charts list --dashboard <uuid>` | `list_charts` | `{ dashboardUuid（必填）, full? }` |
| `charts find <q>` | `find_charts` | `{ searchQueries: [{ label }], … }` |
| `charts get <uuid> [--full]` | `get_saved_chart` | `{ savedChartUuid（必填）, full? }` |
| `charts run <uuid> [--limit n] [--value-format …] [--dashboard <uuid>]` | `run_saved_chart` | `{ savedChartUuid, limit?, valueFormat?, dashboardUuid? }`（无 `full`） |
| `query -e <explore> --dimensions … --metrics … [--filter f=v]… [--filters-json <json>] [--limit n] [--value-format …] [--dashboard <uuid>]` | `run_semantic_metric_query` | `{ exploreName, metrics（必填，缺省补 []）, dimensions?, filters?: { dimensions: [{ fieldId, operator, values }], metrics: [] }, limit?, valueFormat?, dashboardUuid? }` |
| `query --file <path\|->` | `run_semantic_metric_query` | 本地把 Explorer `metricQuery` 翻译为上述扁平入参（见 §7.3） |
| `query flat -e <explore> --dimensions … --metrics … [--sort f:asc\|desc]… [--filters-json <json>] [--limit n]` | `run_metric_query` | `{ vizConfig: { exploreName, metrics, dimensions, sorts: [{ fieldId, descending }], limit }, filters?, dashboardUuid? }`；**实验**，见 §12 |
| `docs [topic] [--text]` | `get_mcp_docs` | `{ topic?（自由字符串）, format? }` |
| `doctor [--remote] [--json]` | 本地自检；`--remote` 时 `tools/list` + 能力探测 | 不发业务查询 |
| `tools list [--verbose]` / `tools describe <name>` | `tools/list` | 本地展示 |
| `call <tool> [--args '<json>' \| --file <path>]` | 任意 `tools/call` | 原样透传；`--args` 与 `--file` 互斥 |

> **已下线（CLI 0.2.4）**：`verified` 命令与其映射的 `list_verified_content` 一并移除——站点没有 content-verification 功能，工具只能返回「不支持」，命令无法产出数据。需要内容清单请用 `charts find` / `dashboards find`，或 `call list_charts` 直通。
| `login` / `logout`（顶层别名） | 本地 | 等价于 `auth login` / `auth logout`；规范形式仍是 `auth *` |
| `auth login\|status\|logout`、`site list\|show\|use` | 本地（不调工具） | 见 §6 |

### 7.3 参数约定

- 维度/指标逗号分隔、可重复：`--dimensions cls_4,mon --metrics total_amount`。
- 语义查询过滤：`--filter fieldId=value`（可重复、多值 `a,b`）→ `filters.dimensions: [{ fieldId, operator: 'equals', values: [...] }]`；复杂条件用 `--filters-json`。
- `query flat` 的每条过滤规则必须带 `fieldType` + `fieldFilterType`（服务端 schema 要求），CLI 无法从 `fieldId=value` 推出，因此该命令**不支持** `--filter`，只能 `--filters-json`。
- `query --file` 是唯一做本地翻译的入口：`metricQuery.{exploreName,dimensions,metrics,limit}` 直接映射；`metricQuery.filters.dimensions.and[].target.fieldId/operator/values` 映射为扁平 `filters.dimensions[]`；`sorts` / `tableCalculations` / `customDimensions` 等对端不支持的字段会被丢弃并在 stderr 告警。
- `--page-size` 上限 100，超出本地截断并在 stderr 告警（`--quiet` 关闭）。
- `projectUuid` 总是可以传：非强制看板模式下服务端会忽略未知键，强制看板模式下它是门控依据。
- 键名以 `msy-x tools describe <tool>` 为准。MCP 会**静默丢弃未知入参键**，因此参数写错表现为「某必填项缺失」，不会提示「未知参数」——这正是 `--dry-run` / `--verbose` 存在的原因。

---

## 8. 输出契约

### 8.1 流分离

- **stdout 只有数据**；进度、提示、警告、错误一律走 stderr。agent 只解析 stdout。
- 颜色仅在对应流为 TTY 且未设 `NO_COLOR` 时启用。

### 8.2 格式选择

1. 显式 `--json` / `--table` / `--csv` 优先；
2. 否则 `stdout.isTTY ? table : json`（**非 TTY 一律 JSON**）；
3. `--csv` 仅对数据类命令有效（`query`、`query flat`、`charts run`、`dashboards run`），其余命令报参数错退 `2`。

### 8.3 JSON 形态

- 单工具命令：输出该工具的数据体本身（CSV 类工具为 `{csv, rows}`）。
- 多工具命令（`info`）：输出**单个**对象 `{ "<tool名>": <数据体>, … }`，可整体 `JSON.parse`。
- `--envelope`：外包 `{"ok":true,"tool":"…","data":…,"meta":{"site":"x","projectUuid":"…","durationMs":812}}`（`projectUuid` 无值时输出 `null`）。
- 非表格文本（markdown / XML）：`{"text":"…"}`；表格模式下原样打印并在 stderr 提示。

### 8.4 数据源探测顺序

1. `structuredContent`（服务端结构化返回）；
2. 文本以 `{` / `[` 开头 → 按 JSON 解析；
3. ` ```json ` 围栏 → 剥围栏后解析；
4. 多行且首行含逗号 → 按 CSV 解析；
5. 以 `<` 开头 → XML 片段，不解析，原样展示；
6. 都不匹配 → 解析失败，退 `7`（`--raw` 打原始响应）。

### 8.5 表格与落盘

- ASCII 表格；单列内容上限 40 字符（超长截断）；终端宽度不足时从末列裁剪；含 `webUrl` 时作为最后一列。
- `--out <path>`：结果写文件（0600）后 stdout 只回摘要——单调用 `{"written","rows","bytes"}`，多调用 `{"written","calls","bytes"}`；一次写盘，不互相覆盖。

---

## 9. 错误与退出码

### 9.1 错误形状（stderr，单行 JSON）

```json
{"error":{"code":"AUTH_REQUIRED","message":"未登录或凭证已失效","hint":"运行 msy-x auth login 重新登录"}}
```

`code` 为英文稳定标识（供程序分支），`message` / `hint` 为中文（供人读）。可选键 `detail` 仅在服务端返回结构化载荷时出现（当前为看板门控五类）。

### 9.2 退出码

| 码 | 含义 | 触发 |
|---|---|---|
| `0` | 成功（含 0 行结果） | — |
| `2` | 用法 / 参数 / 本地配置错误 | 非法 flag、坏 YAML、`--csv` 用在不支持的命令 |
| `3` | 未登录或 401 | 无凭证，或刷新一次后仍 401（含 refresh token 被服务端否掉） |
| `4` | 无权限或被看板门控 | 403、权限错误文案、`dashboard_*` 五类 |
| `5` | 服务端 / JSON-RPC / 工具内部错误 | 5xx、`isError`、工具报错 |
| `6` | 网络或超时 | DNS、连接拒绝、非法端口、超时 |
| `7` | 结果解析失败 | 无结构化内容且 JSON/CSV 解析失败 |

### 9.3 看板门控（服务端开启强制看板模式时）

`error.code` **原样等于服务端 `status`**，退出码固定 `4`，结构化载荷放进 `error.detail`：

| status | CLI 行为 |
|---|---|
| `dashboard_permission_required` | `hint` 附服务端联系文案；`detail` 带 `action` / `dashboardUrl` |
| `dashboard_configuration_required` | 提示看板未配置 |
| `dashboard_selection_required` | `hint` 直接列出候选（`dashboardUuid` + 名称）并提示 `--dashboard`；`detail.candidates` 同数据可机读 |
| `dashboard_not_found` | 提示先用 `dashboards find` 定位 |
| `dashboard_context_unavailable` | 打印服务端原因 |

---

## 10. CLI 连接器契约

### 10.1 配置文件

位置与命名由连接器平台规定（形如 `<平台目录>/cli.json`），本仓不再内置任何平台的连接器包：

```json
{
  "connectors": {
    "msy-x": {
      "install": {
        "default": ["npm install -g https://img0.banmahui.cn/msy-x/cli/msy-x-cli/0.2.4/msy-x-cli-0.2.4.tgz"]
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

### 10.2 平台规则（提交前自查）

- `install` 必填；平台键支持 `linux` / `darwin` / `win32` / `default`，至少包含 `linux` 或 `default`；Linux 命中项只能是 npm 安装命令。
- 每个平台的命令数组不得为空；按顺序执行，任一失败即安装失败。
- `status` 输出需能被 `statusMatchRegex` 命中：本 CLI 保证 `logged_in` 是 JSON 第一个键。
- 包内**不得**包含 CLI 二进制、`client_id`、`client_secret` 或任何真实令牌；OAuth client 由 CLI 在运行时动态注册。
- 连接器键（`msy-x`）不得与同一 Plugin 内的 MCP 服务键重名。

### 10.3 提交材料对照

| 问卷字段 | 填写 |
|---|---|
| 安装方式 | 命令安装（npm） |
| Runtime 及最低版本 | Node.js ≥ 20 |
| 可执行文件名 | `msy-x` |
| 版本检查命令 | `msy-x --version`（输出 `msy-x <semver>` 单行） |
| 是否需要登录 | 需要 |
| 登录命令 | `msy-x auth login`（非交互启动、自动拉起浏览器、阻塞至终态） |
| 登录状态检查命令 | `msy-x auth status` |
| 登录状态匹配正则 | `"logged_in"\s*:\s*true` |
| 登出命令 | `msy-x auth logout` |
| 帮助命令 | `msy-x --help`（无副作用） |
| 远程依赖 | 站点域名（MCP + OAuth authorize/token/register）、npm 源或 tgz 托管域名 |
| 升级方式 | 覆盖安装：`npm install -g` 新版本地址 |

### 10.4 配套技能要求

技能文档需写清：适用任务、业务命令与参数、stdout 结构、退出码、以及「未安装 / 未登录 / 无网络 / 命令失败」四类处置。**不得**引导用户把 PAT 贴进对话——凭证只能由 CLI 自己管理。

---

## 11. 兼容与边界

### 11.1 协议与站点

- 只对接 `/api/v1/mcp`（无状态、逐请求鉴权、服务端持久化默认项目）。
- `--mcp-url` + `--auth-header` 是**通用逃生口**：可指向任意兼容的 MCP 端点（预发、自建网关、代理），CLI 不实现任何私有会话/容量语义。

### 11.2 超时与体量

- 单次工具调用默认 60s，`--timeout` 上限 600s；超时退 `6` 并提示「查询可能仍在服务端执行」。
- 默认 `--limit 500`，实际上限以服务端配置为准（CLI 不自行截断数据）。
- 大结果建议 `--out`：明细落盘、stdout 只回摘要，避免灌满终端或模型上下文。

### 11.3 安全

- 不回显凭证、不写日志文件；`--verbose` 输出前统一脱敏。
- 回环回调只绑 `127.0.0.1`、随机端口、单次、校验 `state`，完成即关闭。
- 不做入参的「聪明」改写（`query --file` 的翻译规则固定在代码里并有单测，未识别字段会告警而非静默丢弃）。

---

## 12. 已知限制

| 限制 | 说明与替代 |
|---|---|
| `query flat`（`run_metric_query`）标「实验」 | 目标站点镜像需包含「MCP 判别键」修复，否则报 `Invalid literal value`；替代：用 `query`（`run_semantic_metric_query`）。`doctor --remote` 会探测并明确提示 |
| `search_field_values` 同受上述镜像要求影响 | 失败时提示改用 `query --dimensions <fieldId>` 自查取值 |
| 不支持写操作 | 对端工具集当前均为只读 |
| 不提供分平台二进制 | 需要 Node ≥ 20；如需免 Node 安装可后续评估 |
| 任务化命令不覆盖全部参数 | 复杂入参用 `--file` / `--args` 透传，或 `call` 直接调工具 |
| 表格单列 40 字符截断 | 需要全量请用 `--json` / `--out` |

---

## 13. 服务端接口参考（自包含）

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/v1/mcp` | POST | MCP JSON-RPC（`initialize` / `tools/list` / `tools/call`）；未授权返回 401 + `WWW-Authenticate` |
| `/api/v1/mcp/health` | GET | 健康检查（`status` / `version` / `stateless`） |
| `/api/v1/mcp` | GET | SSE 心跳流（可选） |
| `/api/v1/oauth/.well-known/oauth-protected-resource` | GET | 受保护资源元数据 |
| `/api/v1/oauth/.well-known/oauth-authorization-server` | GET | 授权服务器元数据（含注册端点） |
| `/api/v1/oauth/register` | POST | 动态客户端注册（返回 `client_id` / `client_secret`） |
| `/api/v1/oauth/authorize` | GET/POST | 浏览器授权（需已登录） |
| `/api/v1/oauth/token` | POST | 换 token / 刷新 token |
| `/api/v1/oauth/introspect` / `revoke` | POST | 内省 / 吊销 |

鉴权方式：PAT（`Authorization: ApiKey <PAT>`）或 OAuth Bearer（scope `mcp:read`）；PAT 不做 scope 校验。
