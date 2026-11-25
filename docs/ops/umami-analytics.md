# 产品埋点：接入公司 Umami（PV/UV + 业务事件）

> **状态：待开发**（分支 `feat/umami-analytics`）。本机自托管 fork 已硬关闭官方遥测（见
> [`self-hosted-disable-official-telemetry.md`](./self-hosted-disable-official-telemetry.md)），
> 本文是**自建**埋点：数据只进公司内网的 `collect.*` → Umami，与官方无关。

## 1. 结论先行

| 问题 | 结论 |
|---|---|
| 目标 | **PV/UV 为主**，附带查询 / 导出 / MCP 调用 / 敏感操作的聚合事件 |
| 埋什么 | 前端 3 个事件（`page_view`、`$AppViewScreen`、`profile_set`）+ 后端 16 个事件镜像（白名单映射） |
| CLI 使用 | **不给 CLI 做上报通道**。`packages/cli` 的 deploy/compile/query/download 都落到后端，用现成的 `Lightdash-Request-Method: CLI` 头就能在属性里切出来 |
| msy-x 使用 | 同上。msy-x 走 MCP → 后端 `mcp_tool_call` 已存在，补 `mcp_client`（MCP `clientInfo.name` 或新增 `X-Lightdash-Client` 头）即可区分 msy-x / claude / cursor / 豆包 |
| 盲区 | 与后端无交互的本地命令（`lightdash --version`、本地 dbt、`msy-x --help`）不埋，v1 不做 |
| 分域 | 对外站 `x.brandct.com` 与内部站 `lightdash.banmahui.cn` 是**同一代码库两套部署** → 同一 Umami 实例、两个 profile、事件与属性键完全一致；**跨站 UV 不合并** |

## 2. 链路与报文

```
浏览器  fetch(urlencoded, keepalive)  ┐
Node    node-fetch(data_list)         ├→ collect.banmahui.cn/api/gp?project&token
                                      ┘     → clklog-umami-adapter → Umami /api/send → PG
```

| 部署 | `UMAMI_COLLECT_PROJECT` |
|---|---|
| 对外 `x.brandct.com` | `msy-x-platform` |
| 内部 `lightdash.banmahui.cn` | `lightdash-internal` |

- `POST` body 用 `application/x-www-form-urlencoded`（浏览器侧属 simple request，**不触发预检**）；
  单条 `data=<base64(json)>`，批量 `data_list=<base64(array)>&gzip=0`。
- **前端一次导航只发 1 个请求**：`data_list` 里装 2 条（`page_view` + `$AppViewScreen`）；
  `profile_set` 低频，单独 `data=`。
- 单条**普通事件**字段（sensors 兼容，字段真相见 dapeng 仓 `docs/track-analytics/reporting-catalog.md`）：
  `distinct_id` / `anonymous_id` / `time` / `type:'track'` / `event` /
  `lib{$lib,$lib_version}` / `identities{user_key,$identity_cookie_id}` / `properties`。
- **`profile_set` 是 sensors 的 profile 事件，不是 track 事件**：报文必须是
  `type:'profile_set'` 且**不带 `event` 字段**，`properties` 就是画像键值。写成
  `type:'track'` + `event:'profile_set'` 时适配层当普通事件落库（Events 里能看到名为
  `profile_set` 的事件），**不会写 `session_data`** → Sessions 视图那个人的 Properties 永远是空。见 §6 联调结论。
- 成功判定：HTTP 2xx 且响应体 `success|ok|空`；`project_not_exist` / `project_token_error` /
  `parse_data_failed` 记 debug 后丢弃，**永不抛错、不阻塞业务请求**。
- **UA 必须像浏览器**（后端）：Umami 用 isbot 过滤机器人，**含 `server` 的 UA 一律丢弃**
  （实测：`LightdashTelemetry/1.0 (+server)`、`LightdashServer/1.0`、`node-fetch/1.0` 都被丢，
  但适配层照样回 `success`，库里没数据 → 极难排查）。固定用
  `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) LightdashTelemetry/1.0`。
  副作用：后端事件在 Umami 里 OS 显示 Linux、Browser 显示 Unknown（UA 解析不出浏览器品牌），属正常；
  按 UA 拆会话时每个 UA 一个新会话，所以浏览器端（web）与服务端事件不会合并到同一个 session。
- base64 必须 UTF-8 安全（组织名/页面名是中文）：前端 `TextEncoder → btoa`，
  后端 `Buffer.from(json, 'utf8')`。直接 `btoa(JSON.stringify(...))` 遇中文会抛
  `InvalidCharacterError`。

## 3. 口径（回答数据问题前必看）

- **PV** = `page_view` 命名事件条数；**UV** = `distinct_id` 去重（`userUuid`）。
- **两套 PV 不可混用**：`$AppViewScreen` 双发产生的 Umami pageview 行 → 原生 Pages/Visitors 报表；
  `page_view` 命名事件 → 带属性、可做业务透视。两者条数应 ≈ 1（验收项）。
- **属性只挂在命名事件上**（pageview 行不存 `event_data`）：按组织/项目/客户端/个人筛选必须走命名事件。
- Umami 的**属性只能筛选、不能聚合**：出「每个组织一行」这类表要用 `msy-umami-query` 的 CLI
  （本地聚合 `event_data`）或后端 SQL。
- 未登录页（login / register / share / embed）也上报，`distinct_id = anon:<installId>`、
  `is_authenticated=false`；embed 另加 `is_embed=true`。
- 时区：查询侧按 `Asia/Shanghai` 切日（`umamiq --tz`）。

## 4. 事件清单（中文名 + 能看什么）

前 3 个前端，后 16 个后端白名单镜像。

| # | 事件名 | 中文名 | 来源 | 能看什么 |
|---|---|---|---|---|
| 1 | `page_view` | 页面浏览 | 前端路由 | **PV/UV 主力**：每天多少人用、看了多少页；看板/空间/图表各被看多少次多少人；某组织/项目/个人在看什么 |
| 2 | `$AppViewScreen` | 页面浏览（原生行） | 与 1 双发 | Umami 原生 Pages / Visitors 报表（趋势、页面排行、实时在线） |
| 3 | `profile_set` | 用户画像 | 前端登录态 | Sessions 视图：这人是谁、哪个组织、什么角色、在哪个项目（**不能做统计口径**） |
| 4 | `dashboard_view` | 看板访问 | 后端 | 哪个看板最热（id/slug/名称）、所属空间、参数化看板使用度（`parameters_count`） |
| 5 | `chart_view` | 图表查看 | 后端 | 哪些图表被**单独打开**、图表类型分布 |
| 6 | `sql_chart_view` | SQL 图表查看 | 后端 | SQL Runner 图表的使用情况 |
| 7 | `query_executed` | 查询执行 | 后端 | 查询量/趋势；按来源拆（看板/图表/探索/SQL/调度）；看板内哪个 tile 在跑（`chart_id`）；CLI 发起占比（`client`） |
| 8 | `query_error` | 查询失败 | 后端 | 失败量与失败率（除 7）、哪个项目/客户端容易出问题 |
| 9 | `download_started` | 导出开始 | 后端 | 导出意图、文件类型分布 |
| 10 | `download_completed` | 导出完成 | 后端 | 导出多少份/多少行（`num_rows`）、谁导得最多 |
| 11 | `mcp_tool_call` | MCP 工具调用 | 后端 | 哪些 AI 客户端在用（`mcp_client`，**只认 `X-Lightdash-Client` 头**，见 §5.1）、用了哪些工具、成功率、耗时 |
| 12 | `user_logged_in` | 用户登录 | 后端 | 登录活跃与登录方式分布（与 PV 对账） |
| 13 | `permission_updated` | 权限变更 | 后端 | 敏感操作：谁改了谁的权限/角色、新增成员/邀请量 |
| 14 | `project_deleted` | 项目删除 | 后端 | 高危操作追溯 |
| 15 | `organization_deleted` | 组织删除 | 后端 | 高危操作追溯 |
| 16 | `user_deleted` | 用户删除 | 后端 | 高危操作追溯 |
| 17 | `pat_created` | 访问令牌创建 | 后端 | 谁在用 API/CLI 凭证、创建量（安全审计） |
| 18 | `share_link_created` | 分享链接创建 | 后端 | 外部分享扩散情况 |
| 19 | `dbt_cloud_integration_deleted` | dbt Cloud 集成解绑 | 后端 | 高危操作追溯 |

**典型提问 → 用哪个事件**

| 想答的问题 | 用 |
|---|---|
| 这周多少人用、多少 PV | `page_view`（UV 按 `distinct_id` 去重） |
| 哪个看板最热 / 某看板被谁看过 | `dashboard_view`（带名称+slug）；`page_view` + `dashboard_id` 筛人 |
| 某组织/某客户在用吗 | `page_view` 按 `org_id` / `org_name` 筛 |
| CLI 用了多少 / msy-x 用了多少 | `query_executed` 按 `client=lightdash-cli`；`mcp_tool_call` 按 `mcp_client=msy-x-cli` |
| 导出了多少份、多少行 | `download_completed`（`num_rows` 求和） |
| 谁改了权限 / 谁删了东西 | `permission_updated` / `project_deleted` / `user_deleted` |
| 漏斗：登录 → 看看板 → 导出 | `user_logged_in` → `dashboard_view` → `download_completed` |

### 4.1 公共属性（中文安全截断 ≤100 字符；按事件频次分两组，见 §7）

| 属性 | 取值 | 来源 | 谁带 |
|---|---|---|---|
| `user_email` | 邮箱 | 前端 `user.email`；后端 ALS `req.user` → LRU 查 `UserModel` | **全部**事件 |
| `org_id` | 组织 uuid | 同上 | **全部**事件 |
| `client` | `web` / `lightdash-cli` / `lightdash-cli-ci` / `mcp` / `scheduler` / `api` / `headless` | 前端固定 `web`；后端 ALS（读 `Lightdash-Request-Method`）+ 路径 | **全部**事件 |
| `user_name` / `org_name` | 显示名 / 组织中文名 | 同上 | 仅低频事件（高频组见 §7.1） |
| `app_version` | 版本号 | `VERSION` | 仅低频事件 |
| `env` | `UMAMI_COLLECT_ENVIRONMENT`（缺省 `mode`） | 后端 `lightdashConfig.umami.environment` → `health.umami.environment` | **仅 `profile_set`**（test/prod 是两个站点，事件里重复带无意义） |

**PII 边界**：email、姓名、组织名、看板/图表名与 slug **允许**（内部 Umami，且属性只能筛选——
不写进属性就查不到人和资源）；手机号、证件号、地址、备注、SQL 文本、字段名、表名、结果集、
密码/token **禁止**。

### 4.2 前端事件属性

| 事件 | 属性 |
|---|---|
| `page_view` | 公共属性 + `page`、`route`、`project_id`、`dashboard_id`、`chart_id`、`space_id`、`settings_section`、`is_embed`、`is_authenticated`、`$url`(=模板路径，绝不含真实 id/凭据)、`$title`(中文页名)、`$event_session_id`；**已不发 `$url_path`**（与 `$url` 重复）和 `env` |
| `$AppViewScreen` | 仅 `$url` / `$title`（落成 pageview 行） |
| `profile_set` | 见 §4.3 |

前端只发 URL 里能拿到的 id（uuid）；`*_slug` / `*_name` 由**后端事件**携带（调用点已有实体对象，
零额外请求）。所以：页面排行/人数看 `page_view`，按看板名/图表名筛选看 `dashboard_view` / `chart_view`。

**凭据类路由一律模板化**：`/reset-password/<code>`、`/invite/<inviteCode>`、`/share/<nanoid>` 里的
`code`/`inviteCode` 是 `nanoid(30)`（不是 uuid，能直接改密码/入组），**绝不能进埋点**。实现上
`pageKey.ts` 对这三条路由显式给模板，且兜底把「非静态段且长度 ≥ 20」的段替换成 `:id`。

### 4.3 `profile_set` 载荷（13 键）

| 类 | 键 | 值来源 |
|---|---|---|
| 身份（不变） | `user_uuid` | `user.userUuid`（与 `distinct_id` 同值，方便直接读） |
| | `user_email` / `user_name` | `user.email`、`firstName+lastName`（码点截断） |
| | `org_id` / `org_name` | `user.organizationUuid` / `organizationName` |
| | `org_role` | `user.role` |
| | `is_trial_account` | `user.isTrialAccount` |
| | `user_created_at` | `user.createdAt`（YYYY-MM-DD） |
| 上下文（会变） | `project_id` / `project_name` | 当前路由里的项目 |
| | `client` | 固定 `web` |
| | `app_version` / `env` | `VERSION` / `health.umami.environment`（= `UMAMI_COLLECT_ENVIRONMENT`，缺省 `mode`） |

发送时机只有 2 个：① 用户信息就绪首帧；② 身份指纹
`user_uuid|org_id|org_role|project_id` 变化。

**报文形态（踩过坑，别再改回去）**：`type:'profile_set'` + `properties`，**没有 `event` 字段**，
`distinct_id = identities.user_key = user_uuid`，`anonymous_id = anon:<installId>`。
拆成 `type:'track'` + `event:'profile_set'` 只在 Events 里多一条事件行，`session_data` 为空
（适配层只按 `type` 决定是否翻译成 Umami identify），会话属性全丢。

**会话语义（已知限制，写清楚免得用错）**：Umami 会话是 `uuid(websiteId, distinct_id)`，
**一人一条生涯级会话**，`session_data` 按 `(sessionId, dataKey)` **后写覆盖** → Sessions 视图里
看到的是「最新归属」（切项目后只剩最后一个项目）。**统计与筛选一律以事件属性为准。**
`profile_set` 只从浏览器发（后端/CLI/MCP 不发，避免与浏览器会话互相覆盖）。

### 4.4 码值约定（埋点不翻译，中文在查询侧映射）

Umami 没有 i18n 层，看板里只展示 `data_key` / `string_value` 原文。所以：

- **键名与码值一律英文**，改码值 = 把历史数据切两半，**永不变更**；
- 中文对照集中在 `msy-umami-query` 仓 `apps/msy-x-platform/dims.json` 的 `dims[].zh` + `values.*`
  （`umamiq` 渲染时映射，`--label id` 看原始值）；前端 `pageTitle.ts` 与 `values.page` 必须同一套码值；
- **本身就是中文的字段直接发中文**：`org_name`、`user_name`、`dashboard_name`、`chart_name`、`space_name`；
- 已知限制：**Umami 原生看板看不到中文**，要中文用 `umamiq` 或导出 CSV。

| 维度 | 码值 → 中文 |
|---|---|
| `page` | `dashboard` 看板详情 · `dashboard_list` 看板列表 · `chart` 图表详情 · `chart_list` 图表列表 · `space` 空间详情 · `space_list` 空间列表 · `explore` 表探索 · `explore_list` 表列表 · `sql_runner` SQL 运行器 · `metrics_catalog` 指标目录 · `catalog` 数据目录 · `project_home` 项目首页 · `usage_insights` 使用分析 · `data_apps` 数据应用 · `settings` 设置页 · `create_project` 新建项目 · `login`/`register`/`signup`/`share`/`embed`/`minimal`/`forbidden` 等同名页 |
| `client` | `web` 网页 · `lightdash-cli` CLI · `lightdash-cli-ci` CLI（CI） · `mcp` MCP · `scheduler` 定时任务 · `api` API · `headless` 无头浏览器 |
| `query_context` | `dashboardView` 看板 · `autorefreshedDashboard` 看板自动刷新 · `exploreView` 表探索 · `chartView` 图表 · `chartHistory` 图表历史 · `sqlChartView` SQL 图表 · `sqlRunner` SQL 运行器 · `viewUnderlyingData` 查看底层数据 · `alert` 告警 · `scheduledDelivery` 定时推送 · `csvDownload` CSV 下载 · `gsheets` Google 表格 · `filterAutocomplete` 过滤器联想 |
| `file_type` | `csv` CSV · `xlsx` Excel · `gsheets` Google 表格 |
| `auth_type` | `oauth` OAuth · `pat` 访问令牌 |
| `mcp_client` | `msy-x-cli` msy-x 命令行 · `claude*` Claude · `cursor*` Cursor · 其余原值 |
| `org_role` | `viewer` 查看者 · `editor` 编辑者 · `admin` 管理员 · `developer` 开发者 · `member` 成员 |
| `chart_kind` | `cartesian` 直角坐标 · `pie` 饼图 · `table` 表格 · 其余取上游枚举 |

### 4.5 粒度：看板 + 图表独立页，不做看板内 tile

| 层级 | 是否埋 | 键 |
|---|---|---|
| 看板页面 | ✅ | `dashboard_id` + `dashboard_slug` + `dashboard_name` + `space_id/name` |
| 图表独立页（`/saved/:uuid`、SQL 图表页） | ✅ | `chart_id` + `chart_slug` + `chart_name` + `chart_kind` |
| 看板内单个 tile | ❌ | 用 `query_executed.chart_id` 覆盖（量是看板页的 10–50 倍） |

`slug` 仅项目内唯一、`uuid` 全局唯一，两个都发：uuid 用于 join 主数据，slug 用于人眼对号与排障。

## 5. 实现（本仓）

### 5.1 后端

| 位置 | 内容 |
|---|---|
| `packages/backend/src/config/parseConfig.ts` | 新增 `umami` 段：`enabled` / `endpoint` / `project` / `token` / `environment`，读 `UMAMI_COLLECT_*`，**缺一项即关闭**（默认零外发） |
| `packages/backend/src/analytics/umami/` | `payload.ts`（组装 + utf8 base64 + urlencode，纯函数）、`UmamiAnalytics.ts`（内存队列，2s 或 20 条 flush `data_list`，上限 200，timeout 3s，失败只 debug）、`mapping.ts`（白名单映射 + `pickProps`）、`requestContext.ts`（AsyncLocalStorage 记录 `client`/`path`） |
| `packages/backend/src/analytics/LightdashAnalytics.ts` | `track()` **在 `if (!writeKey) return` 之前**先转发给 umami（Rudder 逻辑一行不改）；`distinct_id` 解析链见下 |
| `App.ts` / `SchedulerApp.ts` | 构造 `UmamiAnalytics` 注入；ALS 中间件紧邻现有 `req.services = ...`；`App.ts` 里 analytics 先于 models 创建，用 `setUserResolver()` 懒注入 |
| `HealthService` + `packages/common` `HealthState` | 下发 `umami: { enabled, endpoint, project, token, environment }` 给前端（`environment` 给 `profile_set.env` 用） |
| `McpService` | `mcp_tool_call` 加 `mcpClient`（`X-Lightdash-Client` 头优先，回落 `mcpServer.getClientVersion()?.name`） |

**布尔属性一律转字符串** `'true'`/`'false'`（Umami 的 `event_data` 只列 string/number，
直接发 boolean 会让该键筛不出来）——前后端一致，在 `pickProperties` 里统一处理。

**`mcp_tool_call.mcp_client` 只认请求头** `X-Lightdash-Client`：`McpServer` 是服务单例，
无状态 transport 下 `getClientVersion()` 可能是别的会话 initialize 留下的，会把 A 的调用记成 B 的客户端；
拿不到头就记 `unknown`。非 msy-x 的客户端（claude/cursor）暂时都是 `unknown`。

**`distinct_id` 解析链**（决定 UV 准不准）：

```
payload.userId ?? payload.properties.userId ?? payload.properties.createdUserId
  ?? ALS 里的 req.user.userUuid ?? 'server'
```

已核实差异：`query.executed` 走 `trackAccount`（有 userId）；`query.error` 上游既无 userId 也无
orgId（靠 ALS）；`pat_created` 的 userId 在 `properties` 里；`user.logged_in` /
`dbt_cloud_integration.deleted` 无 userId（靠 ALS）。回落 `'server'` 时打计数，
验收要求占比 < 1%。

### 5.2 前端

新增 `packages/frontend/src/providers/Tracking/umami/`：`transport.ts`（utf8 base64 + urlencode +
`fetch(keepalive)` + `pagehide` 时 `sendBeacon`）、`session.ts`（installId / sessionId）、
`pageKey.ts`（路径 → `{page, route, ids}` 纯函数）、`pageTitle.ts`（中文页名）、`profile.ts`、
`UmamiProvider.tsx`（读 `health.umami`，未启用直接返回 children）。

必须遵守：

1. **首屏必须等 `user` resolve 后再发 `page_view`**，否则第一条带 `anon:<installId>`，
   同一人一天算成两个实体（dapeng 踩过：匿名 `distinct_id` 先发 → Sessions 出现 2–3 条）。
   注意 `isAuthenticated=true` 但 `account` 不是注册用户时，`useUser` 的 query 会被禁用而永远
   loading → 用一次 1.5s 超时把它当作 settled，否则整段会话发不出 PV。
2. 幂等：以 `location.key` 为键，同一 key 不重发。
3. 布尔属性转字符串 `'true'`/`'false'`。
4. 挂载在 `App.tsx` 中 `TrackingProvider` 外层/同级（不依赖 Rudder 是否启用）。
5. `umami/` 目录**不得 import** `TrackingProvider` / `rudder-sdk`（本机 jsdom 缺 `localStorage`，
   rudder-sdk 在 import 阶段就崩，保持纯逻辑才能用默认 vitest 配置跑单测）。
6. `profile_set` 报文固定用 `buildProfilePacket()` 生成：`type:'profile_set'`、无 `event` 字段；
   不要手写 `type:'track' + event:'profile_set'`（会话属性会全丢，见 §2 / §4.3）。

### 5.3 环境变量

| 变量 | 说明 |
|---|---|
| `UMAMI_COLLECT_ENABLED` | `true` 才启用（与三要素齐全共同判定） |
| `UMAMI_COLLECT_ENDPOINT` | `https://collect.banmahui.cn/api/gp` |
| `UMAMI_COLLECT_PROJECT` | 对外 `msy-x-platform` / 内部 `lightdash-internal` |
| `UMAMI_COLLECT_TOKEN` | 与 project 成对的 token，**只走 k8s Secret，不入库** |
| `UMAMI_COLLECT_ENVIRONMENT` | 缺省取 `lightdashConfig.mode`；**只用于 `profile_set`**，其余事件已不带 `env` |
| `UMAMI_COLLECT_DEDUPE_SECONDS` | `query_executed` 去重窗口（秒），默认 `300`，`0`=关；key=`distinct_id\|event\|chart_id`（无 `chart_id` 用 `project_id`），见 §7 |
| `UMAMI_COLLECT_SAMPLE_RATE` | `query_executed` 采样率，默认 `1`（取值 0–1）；只适合看趋势，见 §7 |

k8s 注入与 token 处理见 [`umami-analytics-k8s-config.md`](./umami-analytics-k8s-config.md)。
代码与值解耦：**env 未注入 = `enabled=false`，前后端零外发**，所以代码可以先上，不影响线上。

## 6. 验证与验收

**单测（只跑改动文件，全部带 timeout）**

```bash
# 后端是 jest（vitest 只跑 integration）
timeout 300 pnpm -F backend jest --config jest.config.js src/analytics/umami src/config/parseConfig.test.ts
# 前端纯逻辑文件，用仓库默认配置即可
cd packages/frontend && timeout 240 npx vitest run src/providers/Tracking/umami --reporter=dot
```

覆盖：报文/utf8 base64/urlencode、白名单命中与属性裁剪、未知事件返回 null、攒批与 flush 时机、
失败不抛、队列上限、LRU 用户信息降级、`pageKey` 表驱动、`profile` 指纹判重。

**联调结论（2026-11-24 ~ 25，dev 适配层已实测）**

| 验证项 | 结果 |
|---|---|
| `project=msy-x-platform` + token 成对 | ✅ 返回 `success` |
| `event: 'page_view'` 落点 | ✅ **命名事件**（`event_data` 里的 `page`/`client` 可筛） |
| `event: '$AppViewScreen'` 落点 | ✅ **pageview 行**（Pages/PV 报表来源） |
| 双发是否重复计 PV | ❌ 不重复：一次导航 = 1 条命名事件 + 1 条 pageview 行 |
| `data_list` 批量 | ✅ 可用（`gzip=0`） |
| 中文属性（`$title`/看板名） | ✅ 不乱码 |
| 非浏览器 UA | ❌ 被 isbot 丢弃（见 §2） |
| `type:'profile_set'`（sensors 语义，无 `event`） | ✅ 写 `session_data`（`/sessions/{id}/properties` 可读），**不产生事件行** |
| `type:'track'` + `event:'profile_set'`（旧实现） | ❌ 只落一条事件行，`/sessions/{id}/properties` 返回 `[]` → Sessions 无属性 |

**联调**（先用内部站 `lightdash-internal`，流量小好洗）

```bash
curl -sS -X POST "https://collect.banmahui.cn/api/gp?project=lightdash-internal&token=$TOKEN" \
  --data-urlencode "data_list=$(printf '%s' "$JSON" | base64 -w0)" --data 'gzip=0'
# 期望 success|ok|空；project_not_exist / project_token_error = 配置错
```

**验收标准**

1. 未配 `UMAMI_COLLECT_*`：`/api/v1/health` 的 `umami.enabled=false`，浏览器与后端零外发，原有功能无变化
2. `page_view` 条数 ÷ pageview 行条数 ∈ [0.9, 1.1]
3. 同一用户当天只算 1 个 UV；`distinct_id='server'` 占比 < 1%
4. Events 里能看到 §4 的 19 个事件；`client` 可筛 `web` / `lightdash-cli` / `mcp`；`mcp_tool_call` 可筛 `mcp_client=msy-x-cli`
5. 可查人性：按 `user_email` / `org_name` / `dashboard_name` / `chart_slug` 筛选都能出数据且中文不乱码
6. `/api/v1/health` 下发 `umami` 字段且前端能读到
7. `pnpm -F backend typecheck`、`pnpm -F frontend typecheck` 通过；Rudder/PostHog 行为零变更

## 7. 事件量与优化

`query_executed` 是唯一的高频事件：看板每个 tile 一次查询，自动刷新（5/15/30 分钟档）会成倍
放大。已落地三类优化：**去重与采样**（只作用于 `query_executed`）、**高频事件属性瘦身**、
**攒批 20 条/2s → 50 条/5s**（只减少发往 collect 的 HTTP 请求数，不影响落库行数）。

### 7.1 单条事件的落库成本

Umami 每条事件落 1 行 `website_event` + 每个属性 1 行 `event_data`，成本 = **1 + 属性数**。

| 事件 | 属性数（优化后） | 落库行数/条（1+属性数） | 频率量级 |
|---|---|---|---|
| `page_view` | ≈15–18 | ≈16–19 | 每次页面导航 1 条 |
| `$AppViewScreen` | 2 | 3 | 每次页面导航 1 条（与 `page_view` 双发，落 pageview 行） |
| `query_executed` / `query_error` | ≈8–10 | ≈9–11 | **每 tile 每次查询 1 条**（量级最大） |
| `dashboard_view` / `chart_view` / `sql_chart_view` | ≈12–13 | ≈13–14 | 每次打开 ≈1 条 |
| `download_started` / `download_completed` | ≈8–9 | ≈9–10 | 每次导出各 1 条 |
| `mcp_tool_call` | ≈7–8 | ≈8–9 | 每次工具调用 1 条 |
| `user_logged_in` | ≈7 | ≈8 | 每人每天 0–几次 |
| `profile_set` | 13 | 13（只写 `session_data`，不落事件行） | 低频：身份指纹变化才发 |
| 敏感操作（`permission_updated` / `*_deleted` / `pat_created` / `share_link_created` 等） | ≈7–10 | ≈8–11 | 罕见，可忽略 |

> 属性数为按 §4.1–4.2 现状的近似折算。高频组（`query_executed` / `query_error` /
> `download_started` / `download_completed` / `mcp_tool_call`）已裁掉 `user_name` / `org_name` /
> `app_version`，公共属性只剩 `user_email` / `org_id` / `client`；查询事件的
> `metrics_count` + `dimensions_count` 合并为 `fields_count`；`env` 只剩 `profile_set` 带。

### 7.2 量级示例

场景：20 tile 看板，50 人/天各完整看 1 次，其中 20%（10 人）开 5 分钟自动刷新并停留 30 分钟。

| 指标 | 优化前 | 优化后 |
|---|---|---|
| 事件数/天 | ≈2200 | ≈1200 |
| `event_data` 行/天 | ≈33k | ≈11k |

演算：浏览类 ≈150（`page_view` + `$AppViewScreen` + `dashboard_view` 各 50）+ 首查 1000
（50 人 × 20 tile）+ 自动刷新 1000（10 人 × 5 轮 × 20 tile）≈ 2200；优化后刷新轮次被 5 分钟
去重吸收，≈1150。行数差异主要来自属性瘦身：优化前单条平均 ≈15 行，优化后高频事件 ≈9 行。

### 7.3 去重会少记什么

`UMAMI_COLLECT_DEDUPE_SECONDS`（默认 `300`，`0`=关），key = `distinct_id\|event\|chart_id`
（无 `chart_id` 用 `project_id` 兜底），**只对 `query_executed` 生效**：

| | 说明 |
|---|---|
| 被吸收 | **同一人 + 同一 tile** 在窗口内的重复查询：间隔 ≤ 窗口的自动刷新轮次（默认窗口下即 5 分钟档）、连点/双击刷新 |
| 不受影响 | 不同人、不同 tile、15/30 分钟档自动刷新（间隔 > 窗口），以及 CLI / API / 调度发起的查询 |
| 代价 | `query_executed` 不再是精确计数；**需要精确次数时把 `UMAMI_COLLECT_DEDUPE_SECONDS=0`**（自动刷新场景事件量会回升） |

### 7.4 采样

`UMAMI_COLLECT_SAMPLE_RATE`（默认 `1`，取值 0–1），**只对 `query_executed` 生效**：按比例随机丢弃。

- `sampleRate=0.2` → 事件数是真实值的 **1/5**；真实量 ≈ 报表量 ÷ 0.2。
- 只适合看**趋势与占比**（同比例缩放不失真），**不要用于对账、计费、SLA** 等绝对数场景。

### 7.5 保留策略（运维侧，不在代码里）

按 §7.2 量级，PG 里每天 ≈1.2 万行（`website_event` + `event_data`），90 天 ≈100 万行，
查询密集的组织更高。建议对 `website_event` / `event_data` 做 90 天归档或删除
（分区表 / pg_partman / 定时 DELETE 任选），在库侧定期执行。

## 8. 已知边界

| 项 | 说明 |
|---|---|
| 属性不能聚合 | 出「每个组织一行」的报表要用 `umamiq`（本地聚合）或后端 SQL |
| 两套 PV | pageview 行 ≠ `page_view` 命名事件，`--basis` 要显式选，别混用 |
| pageview 行无属性 | 按组织/人筛完，Pages 报表会变空，属正常 |
| `session_data` 后写覆盖 | Sessions 只看「最新归属」，历史归属用事件属性 |
| 原生看板无中文 | 中文要靠 `umamiq` / 导出 CSV |
| 无历史回溯 | 埋点上线前的行为拿不到，只能往后累积 |
| `profile_set.project_name` 暂缺 | 前端路由只有 project uuid，取名字要多一次请求 → 只发 `project_id`，名字靠后端事件 |
| 外发合规 | 这是**新增**外发，目标为公司内网 `collect.banmahui.cn`，与官方遥测无关；kill switch 见 k8s 文档 |

## 9. 配套（跨仓库，各自独立分支）

| 仓库 | 分支 | 内容 |
|---|---|---|
| 本仓 | `feat/umami-analytics` | 本文 §5 的实现 + 文档 |
| `k8s-config` | `feat/umami-analytics` | 两个 ConfigMap + 两个 SopsSecret（见 [`umami-analytics-k8s-config.md`](./umami-analytics-k8s-config.md)）；改好后需摘到 `pre` / `master` |
| `msy-umami-query` | `feat/umami-analytics` | `apps/msy-x-platform/`（dims + app/events/caveats）+ `profiles.json` 两个 profile（`msy-x-platform` / `lightdash-internal`，都指同一个 app）；删掉现有 `apps/lightdash`、`apps/lightdash-internal` 空占位 |
