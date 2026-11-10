# MCP 统一改造归档（分支 `feat/mcp-unified-backend`）

> **归档日期**：2026-10-27（P8 实施于 2026-11-10）
> **状态**：✅ P0–P8 全部完成
> **分支**：`feat/mcp-unified-backend`（未合入主干，代码可完整保留）
> **P8 已落地**：四级兜底链已实施，见 §4 与 git 提交记录。

---

## 1. 一句话现状

主站 MCP 已完成 P1–P7 全部阶段：核心能力从 `src/ee/` 下沉到非 EE 后端、鉴权统一为「OAuth + PAT」并落实 scope 校验、26 个工具全部模块化迁移并带单测、埋点收口、健康检查与文档齐备。

**最后一步已于 2026-11-10 落地：MCP 的项目上下文语义从「当前项目」收敛为「默认项目」**，建立「显式参数 → 用户级默认 → 组织级默认 → 部署级默认」四级兜底链。**保留**服务端持久记忆与 26 个工具（不删除 `set_project` / `get_current_project`）。实施记录见 §4。

---

## 2. 已完成的工作

### 2.1 阶段与提交

| 阶段 | 状态 | 提交 | 内容 |
|------|------|------|------|
| P0 | ✅ | — | 盘点主站 EE MCP / 独立包 `packages/lightdash-mcp` / `origin/feat/mcp-v2` 三处实现 |
| P1 | ✅ | `23bf6df91` | `src/ee/services/McpService` → `src/services/McpService`；AI 公共工具/类型/prompt 迁至 `src/services/ai/`；EE AI Copilot 改为引用新路径 |
| P1 | ✅ | — | `McpService` 默认工厂迁入 `src/services/ServiceRepository.ts`，删除 `src/ee/index.ts` 中的 MCP provider |
| P2 | ✅ | `db812ab56` | 新增 `McpAuthContext.ts`；`McpAuthType.OAuth` / `McpAuthType.Pat`；`mcpRouter.ts` 增加 `getMcpAuthInfo(req)`；OAuth token/clientId/scopes 与 PAT 信息写入 `authInfo.extra` |
| P2 | ✅ | — | 恢复被注释的 `mcp:read` / `mcp:write` scope 校验；新增 `MCP_OAUTH_REQUIRED_SCOPES` 配置（默认 `mcp:read`）；新增迁移 `20261012090000_add_mcp_read_scope_to_oauth_clients.ts` |
| P3 | ✅ | `863761bc6` | 新增 `McpToolName.ts` / `tools/types.ts` / `tools/scopes.ts` / `tools/registry.ts` / `tools/helpers.ts` / `tools/deps.ts` / `tools/orgTools.ts` |
| P3 | ✅ | `ae671336f` | 显式 `projectUuid` 优先于 PG 上下文；`getMcpCompatibleSchema()` 移除 AI agent 专用 `type` discriminator；PG 上下文按 `user_uuid + organization_uuid` 隔离 |
| P3 | ✅ | `7cc9912a9` | 接入 access/docs 模块；新增 `GET /api/v1/mcp/health`；迁移 analyst prompt；新增 `tools/registry.test.ts` 与 prompt/framework 测试 |
| P4 | ✅ | `4f8eaddbc` | `tools/queryTools.ts`：`list_explores`、`run_semantic_metric_query` |
| P4 | ✅ | `085699a11` | `tools/savedChartTools.ts`、`tools/dashboardTools.ts`：`get_saved_chart`、`get_dashboard_code`、`get_dashboard_tiles` |
| P4 | ✅ | `9dfa66c5d` | `tools/contentSearchTools.ts`、`tools/contentListTools.ts`、`tools/chartRunTools.ts`：`find_content` / `find_charts` / `find_dashboards` / `find_spaces`、`list_spaces` / `list_dashboards` / `list_charts` / `list_verified_content`、`run_saved_chart` / `run_dashboard_tiles` |
| P4 | ✅ | — | 删除 `McpService.setupHandlers()` 中旧的重复注册（`FIND_DASHBOARDS` / `FIND_CHARTS`），避免 SDK 抛 `Tool ${name} is already registered` |
| P5 | ✅ | `fd3846d0b` | 抽出 `runFindExplores` / `runFindFields` / `runFindCharts` / `runFindDashboards` / `runRunMetricQuery` / `runSearchFieldValues`；MCP 工具不再经过 AI SDK 包装，错误不再被压平 |
| P5 | ✅ | `859f030a3` | 抽出 `mcpAuthInfo.ts` + 测试 |
| P6 | ✅ | `65ca5f9db` | 工具调用埋点统一收口到 `McpToolRegistry`；`mcp_tool_call` 事件新增 `authType` / `durationMs` / `success`；scope 拒绝不记为工具调用；观测失败不阻断业务调用；`list_verified_content` 明确返回"不支持" |
| P6 | ✅ | `cb74ed583` | 工具 inventory 测试 + 路由鉴权流程测试 |
| P7 | ✅ | `44091e2a3` | common MCP schema 从 `packages/common/src/ee/AiAgent/schemas/` 迁至 `packages/common/src/schemas/mcp/` |
| P7 | ✅ | `4ee83bd6e` | 独立包退役评估：`docs/mcp/lightdash-mcp-retirement-evaluation.md` |
| P7 | ✅ | `f958ed33e` | 主站 v2 接入指南 `docs/mcp/mcp-v2-guide.md` + 内置文档修正 |

### 2.2 当前代码状态

**目录结构（已下沉到非 EE）**

```
packages/backend/src/services/McpService/
├── McpService.ts              # 传统 10 工具 + 服务主体
├── McpToolName.ts             # 工具名枚举（26 个）
├── McpAuthContext.ts          # 鉴权上下文（OAuth / PAT）
├── mcpAuthInfo.ts             # 从 request 构造 authInfo
├── McpSchemaCompatLayer.ts    # zod → MCP JSON Schema 兼容层
└── tools/
    ├── registry.ts            # 唯一注册入口：scope 校验 + 埋点包装
    ├── scopes.ts              # MCP_TOOL_SCOPES（工具 → scope）
    ├── deps.ts                # McpToolDeps（服务依赖容器）
    ├── types.ts               # McpToolContext
    ├── helpers.ts             # jsonToolResult / textToolResult
    ├── orgTools.ts            # get_site_info
    ├── accessTools.ts         # get_my_access
    ├── docsTools.ts           # get_mcp_docs
    ├── queryTools.ts          # list_explores / run_semantic_metric_query
    ├── contentSearchTools.ts  # find_content / find_charts / find_dashboards / find_spaces
    ├── contentListTools.ts    # list_spaces / list_dashboards / list_charts / list_verified_content
    ├── savedChartTools.ts     # get_saved_chart
    ├── dashboardTools.ts      # get_dashboard_code / get_dashboard_tiles
    ├── chartRunTools.ts       # run_saved_chart / run_dashboard_tiles
    ├── analystPrompt.ts       # 分析师 prompt
    └── analystPromptTools.ts
```

**当前注册 26 个工具**

```
find_charts              find_content            find_dashboards
find_explores            find_fields             find_spaces
get_current_project      get_dashboard_code      get_dashboard_tiles
get_lightdash_version    get_mcp_docs            get_my_access
get_saved_chart          get_site_info           list_charts
list_dashboards          list_explores           list_projects
list_spaces              list_verified_content   run_dashboard_tiles
run_metric_query         run_saved_chart         run_semantic_metric_query
search_field_values      set_project
```

**鉴权模型**

| 维度 | OAuth | PAT |
|------|-------|-----|
| 鉴权头 | `Authorization: Bearer <token>` | `Authorization: ApiKey <PAT>` |
| 基础 scope | 需含 `MCP_OAUTH_REQUIRED_SCOPES`（默认 `mcp:read`） | 不受限 |
| 工具 scope | 按 `MCP_TOOL_SCOPES` 校验 `mcp:read` / `mcp:write` | 不受限 |
| 会话 | 无 `Mcp-Session-Id` | 无 `Mcp-Session-Id` |

> 当前 26 个工具**全部**标记为 `mcp:read`（含 `set_project`，因为它只更新上下文、不修改 Lightdash 内容）。

**HTTP 约束**：POST 必须带 `Accept: application/json, text/event-stream`，否则 406。

**健康检查**：`GET /api/v1/mcp/health` 返回 MCP 是否启用、版本与无状态标记（`stateless` 目前仅表示无 MCP session header）。

### 2.3 文档产出

| 文档 | 说明 |
|------|------|
| `docs/mcp/README.md` | 版本入口 |
| `docs/mcp/mcp-unified-backend-plan.md` | 本次改造的完整方案（阶段、决策、风险） |
| `docs/mcp/mcp-v2-guide.md` | 主站 `/api/v1/mcp` 接入指南（正式版） |
| `docs/mcp/lightdash-mcp-retirement-evaluation.md` | 独立包去留评估（推荐分阶段退役） |
| `docs/mcp/mcp-tool-porting-guide.md` | 工具迁移指南 |

**版本口径已定稿**：v1 = 独立包 `packages/lightdash-mcp`（弃用）；v2 = 主站 `/api/v1/mcp`（正式版，唯一推荐）。

---

## 3. 已定稿的关键决策

| # | 决策 |
|---|------|
| 1 | MCP 核心下沉非 EE 后端，OSS 自托管可用；不引入 Keycloak / 外部 IdP |
| 2 | 主站统一 MCP 完全无 HTTP 会话，不返回 `Mcp-Session-Id` |
| 3 | 工具直接调用 backend service（`CatalogService` / `ContentService` / `SavedChartsService` / `DashboardService` / `SpaceService`），**禁止** `fetch` / `axios` 自环 |
| 4 | 工具注册唯一收口到 `McpToolRegistry`，保证鉴权、scope、埋点一致 |
| 5 | 鉴权仅「主站自建 OAuth + PAT」；PAT 不受 scope 限制；OAuth 缺 scope 自动回落 `mcp:read`；DCR 只保留 `mcp:read` / `mcp:write` |
| 6 | 工具描述用英文；分页参数 `z.coerce.number()`，默认 `page=1` / `pageSize=50`；返回统一 `jsonToolResult()` / `textToolResult()` |
| 7 | 每个新工具必须同时登记 `McpToolName` 与 `tools/scopes.ts` |
| 8 | 观测失败不得影响工具调用；scope 拒绝不算工具调用 |
| 9 | 优先调用自带 CASL / space 过滤的 service；需显式项目鉴权时用 `context.ability.can('view', subject('Project', { organizationUuid, projectUuid }))` |
| 10 | `list_verified_content` 在无 content-verification 的部署上返回结构化"不支持"，**不**新增 DB 列 / service / model |
| 11 | 工具收敛**无损优先**：先新增合并工具并把旧工具标 deprecated（输出结构不变），再删别名 |
| 12 | 不提交 `pnpm generate-api` 产生的大规模无关 swagger diff |
| 13 | MCP schema 不暴露 AI agent 的 `type` discriminator |
| 14 | 独立包暂时保留（避免打断存量客户端），后续转退役 |
| 15 | 26 个工具是"主站原有 + 独立包"迁移对齐的产物，**不是**设计目标；收敛方向 26 → 18（激进 17） |
| 16 | **【2026-10-27 修订】保留服务端持久项目记忆**，不删除 `set_project` / `get_current_project` / `mcp_context`；工具数保持 26 |
| 17 | **【2026-10-27 修订】语义从「当前项目」改为「默认项目」** —— 解决「LLM 静默用错过期项目」隐患 |
| 18 | **【2026-10-27 修订】四级兜底链**：显式 `args.projectUuid` → 用户级默认（`mcp_context`）→ 组织级默认（`organizations.default_project_uuid`）→ 部署级 `LIGHTDASH_PROJECT_UUID` |
| 19 | **【2026-10-27 修订】逐级回落规则**：显式参数校验失败直接报错；隐式兜底校验失败自动降级到下一级 |
| 20 | **【2026-10-27 修订】不以「与 `origin/feat/mcp-v2` 工具集完全对齐」为目标** —— v2 是分支不是规范，产品需求优先 |
| 21 | **【2026-10-27 修订】工具名保留** `set_project` / `get_current_project`，不新增别名、不标 deprecated —— 无损优先 |
| 22 | **【2026-10-27 修订】新增可选 `catalogTags` 参数**（`find_explores` / `find_fields`），优先级 `显式 > context` |
| 23 | **【2026-10-27 修订】部署级 `LIGHTDASH_PROJECT_UUID` 不提供默认值**，由部署方显式配置 |

---

## 4. 未完成工作：主站项目上下文改造（P8）

> ✅ **本节已实施（2026-11-10，多 agent 并行交付：P8.1 配置注入 / P8.2 核心解析 / P8.3 文案 / P8.4 文档）**。以下规划文本保留作为实施依据。

### 4.0 方向变更（2026-10-27 复盘后修订）

**原方案**：移除 `set_project` / `get_current_project`，删除 MCP 对 `mcp_context` 表的依赖，26 → 24 工具，与 `origin/feat/mcp-v2` 完全对齐。

**新方案**：**保留服务端持久记忆**，把语义从「当前项目」收敛为「默认项目」，建立四级兜底链；工具数量保持 26。

**变更原因（均已人工核验）：**

1. **线上独立包 `lightdash-mcp` 并没有"用 session 存项目"。** 它的 `set_project` 存在**进程内存 Map** 里 —— `packages/lightdash-mcp/src/lib/mcpSessionStore.ts`：
   ```ts
   const sessions = new Map<string, McpSessionState>();
   function storageKey(apiKey: string) { return sha256(apiKey) }  // 按 PAT 隔离，不是按 MCP session
   const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
   ```
   文件头注释原文：**「在无服务端 `mcp_context` 表时，按 PAT 在内存中保存 set_project 状态」**。
   → 独立包自己知道服务端本该有 `mcp_context` 表，它是因为单跑够不到那张表才退化成内存 Map。**它是主站方案的降级版，不是主站该模仿的对象。**

2. **「协议层无会话 + 服务端持久状态」是三者中最优组合。** 独立包的内存 Map 重启即丢、多副本不共享、需 sticky session；主站 PG 表跨实例 / 跨重启 / 跨客户端一致，同时主站**没有 MCP session**（`sessionIdGenerator: undefined`），不需要 session id 过期 / 轮换 / 重连那一套。

3. **原方案是照抄 `origin/feat/mcp-v2` 的形态。** v2 是分支不是规范；产品需求优先于分支对齐。

4. **真正的问题不是「有没有记忆」，而是「记忆的语义」。** 详见 §4.2。

### 4.1 目标与非目标

**目标**

- 保留服务端持久项目记忆，但把它重新定义为**「默认项目」**而非「当前项目」。
- 显式参数永远优先；隐式兜底逐级回落，每级都做权限校验。
- 消除「静默用错项目」隐患。
- 保持无 MCP session（现状不变），保持多副本 / 重启安全。

**非目标**

- ❌ 不追求「24 工具 = 与 `origin/feat/mcp-v2` 完全对齐」。工具数保持 **26**。
- ❌ 不删除 `mcp_context` 表、`McpContextModel`、`set_project` / `get_current_project` 工具。
- ❌ 不改协议层（仍不返回 `Mcp-Session-Id`）。
- ❌ 不做工具收敛（26 → 18，另见 §5）。

### 4.2 语义定义：为什么「当前项目」是错的

当前 `mcp_context` 存的是**「当前正在操作的项目」**（current project）。这是个有生命周期、会过期、可能悄悄错的状态：

- 用户上周在项目 A，今天在项目 B。LLM 客户端不传 `projectUuid` 时**静默查了 A** —— 查出来的数字看起来完全合理，只是项目错了，很难被察觉。
- 同一用户开两个 MCP 客户端（Claude Desktop + Cursor）共享同一个"当前项目"，互相覆盖。

改为**「默认项目」**（default project）后：

- 静态语义，不随时间漂移。
- 显式 `projectUuid` 永远优先 → 想要哪个项目就传哪个，不会被"默认值"劫持。
- 隐式兜底只是"没指定时的默认选择"，不会伪装成"用户当前正在做的事"。

### 4.3 四级兜底链

```
① args.projectUuid            显式参数 —— 永远最高优先级
② mcp_context                 用户级个人默认项目（per user + per org），现有表
③ organizations.default_project_uuid   组织级默认项目（管理员配置），现有字段
④ 部署级 LIGHTDASH_PROJECT_UUID         可选，self-hosted 单组织场景
⑤ 都没有                      报错
```

**逐级回落的权限校验规则（关键）：**

| 级别 | 校验失败时的行为 | 理由 |
|---|---|---|
| ① 显式参数 | **直接报错**，不回落 | 用户明确指定了项目，静默换成别的更危险 |
| ②③④ 隐式兜底 | **继续往下一级** | 默认值可能已失效（项目被删 / 权限被回收），应自动降级而不是整条链路失败 |

- 每级校验统一走 `projectService.getProject(projectUuid, account)` —— 它内部已执行 `account.user.ability.cannot('view', subject('Project', { organizationUuid, projectUuid }))` 并抛 `ForbiddenError`。
- ② 的粒度（per user + per org）保持现状即可：**它是用户偏好，不是组织配置**，所以 `set_project` 不应去写 `organizations.default_project_uuid`（那是全员共享，一个用户改了会影响别人）。
- ④ 是**部署级全局值**，多租户下会指向同一个项目 —— 安全性由「每级都做权限校验 + 逐级回落」保证：其他组织的用户校验失败后会自动回落到 ③。

### 4.4 tags 语义

- `set_project` 的 `tags` → 语义变为**「默认标签过滤」**（用户级偏好）："我默认只看这些标签的 explore / 字段"。
- 沿用现有链路：`mcp_context.tags` → `filterExploreByTags` + `catalogSearch.yamlTags`。
- **【已定稿，见 §4.9 决策 2】** `find_explores` / `find_fields` 新增**可选** `catalogTags` 显式参数，优先级 `显式 catalogTags > mcp_context.tags`；`catalogTags: []` 表示不过滤（不回落到 context）。纯增量、不改旧行为。纳入 P8.3 范围。

### 4.5 实施计划

| 子阶段 | 内容 | 规模 | 验收 |
|---|---|---|---|
| **P8.1** | 配置与依赖注入：`parseConfig.ts` 新增 `mcp.defaultProjectUuid`（来源 `LIGHTDASH_PROJECT_UUID`）；`McpToolDeps` 增加 `organizationModel`；`ServiceRepository` 注入 | S | typecheck 通过；config mock 同步 |
| **P8.2** | 新增 `tools/projectContext.ts` 统一解析 helper；六个工具模块 + `McpService.resolveProjectUuid()` 全部改为委托；消除六份重复实现 | M | 单元测试覆盖四级兜底；模块测试更新 |
| **P8.3** | 语义与文案：按 §4.10 逐条改工具描述、共享常量、错误文案、内置文档 `mcpDocsContent.ts`、analyst prompt；**新增 `catalogTags` 参数**（`find_explores` / `find_fields`） | S-M | 文档与 prompt 与新语义一致；`catalogTags` 优先级有单测 |
| **P8.4** | 文档更新：`mcp-v2-guide.md`、`mcp-tools-permissions.md`、本文件 §5 | S | 文档自洽 |
| **P8.5** | 回归：typecheck + eslint + jest | S | 全绿 |

### 4.6 改动文件清单

**核心代码**

| 文件 | 改动 |
|---|---|
| `packages/backend/src/config/parseConfig.ts` | `mcp` 配置新增 `defaultProjectUuid: string \| null`（`process.env.LIGHTDASH_PROJECT_UUID ?? null`，不设默认值） |
| `packages/backend/src/config/lightdashConfig.mock.ts` | 同步 mock |
| `packages/backend/src/services/McpService/tools/deps.ts` | `McpToolDeps` 增加 `organizationModel: OrganizationModel` |
| `packages/backend/src/services/McpService/tools/projectContext.ts` | **新增**：统一项目解析 + 权限校验 helper + 共享文案常量（§4.10.1） |
| `packages/backend/src/services/McpService/McpService.ts` | `resolveProjectUuid()` 委托新 helper；`getProjectUuidFromContext()` 语义调整（用户级默认项目）；新增组织级 / 部署级兜底；`set_project` / `get_current_project` 工具描述与返回字段 `source`；`getFindExploresFunction()` / `getFindFieldsFunction()` 支持 `catalogTags` |
| `packages/backend/src/services/McpService/tools/queryTools.ts`<br>`contentSearchTools.ts` / `contentListTools.ts` / `savedChartTools.ts` / `dashboardTools.ts` / `chartRunTools.ts` | 删除各自复制的 `resolveProjectUuid` / `assertCanViewProject`，改用统一 helper；`projectUuid` 参数描述改用共享常量；错误文案改用共享常量 |
| `packages/backend/src/services/ServiceRepository.ts` | `getMcpService()` 注入 `organizationModel` |

**保持不变（明确不动的）**

- `packages/backend/src/services/McpService/McpToolName.ts` — 工具名保留 26 个
- `packages/backend/src/services/McpService/tools/scopes.ts` — scope 映射不变
- `packages/backend/src/models/McpContextModel.ts` — 保留
- `packages/backend/src/database/migrations/20250811180000_create_mcp_context_table.ts` — 保留，不新增 migration
- `packages/backend/src/ee/index.ts` — 无需改动（`mcpContextModel` provider 仍有消费者）

**文案 / 文档**

| 文件 | 改动 |
|---|---|
| `packages/backend/src/services/McpService/tools/mcpDocsContent.ts` | 「当前项目」→ 「默认项目」；说明四级兜底 |
| `packages/backend/src/services/McpService/tools/analystPrompt.ts` / `analystPromptTools.ts` | prompt 措辞 |
| `docs/mcp/mcp-v2-guide.md` | 项目解析章节改写；工具数 26 不变 |
| `docs/mcp/mcp-tools-permissions.md` | `set_project` / `get_current_project` 的说明措辞 |
| `docs/mcp/mcp-unified-backend-plan.md` | §3.2 与 P8 进度行 |

**测试**

| 文件 | 改动 |
|---|---|
| `packages/backend/src/services/McpService/McpService.context.test.ts` | 重写为四级兜底覆盖 |
| `packages/backend/src/services/McpService/McpService.tools.test.ts` | 数量仍 26，**不需要改** |
| `packages/backend/src/services/McpService/tools/projectContext.test.ts` | **新增**：四级兜底 + 逐级回落 + `catalogTags` 优先级 |
| 各工具模块 `*.test.ts` | mock 调整（`organizationModel`、移除对模块内 `resolveProjectUuid` 的断言） |

### 4.7 测试计划

**新增单测（`tools/projectContext.test.ts`）**

- 显式 `projectUuid` 命中 → 返回 `source: 'argument'`
- 显式 `projectUuid` 无权限 → 抛 `ForbiddenError`，**不**回落
- 显式缺失 + context 命中 → `source: 'user_default'`
- context 存在但已失效（`getProject` 抛错）→ 自动落到组织默认
- 组织默认命中 → `source: 'organization_default'`
- 组织默认失效 → 落到部署级 env
- 全部缺失 → 抛 `ForbiddenError`，报错文案 = `NO_DEFAULT_PROJECT_ERROR` 且含 `NO_DEFAULT_PROJECT_HINT`
- 每一级返回后，都再校验一次访问权限

**`catalogTags` 优先级单测**

- `catalogTags: ['a']` + context tags `['b']` → 生效 `['a']`
- `catalogTags: []` + context tags `['b']` → **不过滤**（不回落到 context）
- 不传 `catalogTags` + context tags `['b']` → 生效 `['b']`（保持旧行为）
- 不传 `catalogTags` + 无 context tags → 不过滤（保持旧行为）

**回归**

```bash
cd packages/backend
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --project tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=4096 npx eslint -c .eslintrc.js --ignore-path ./../../.gitignore src/services/McpService src/services/ai src/routers/mcpRouter.ts
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npx jest --config jest.config.js src/services/McpService src/routers/mcpRouter.test.ts
```

> 后端 typecheck 在默认 Node heap 下会 OOM，必须带 `--max-old-space-size=6144`。

### 4.8 风险与回滚

| 风险 | 缓解 |
|---|---|
| 破坏存量客户端对 `set_project` / `get_current_project` 的调用 | **工具名与入参不变**，只改描述与内部语义；返回结构保持兼容 |
| 部署级 env 在多租户下指向他组织项目 | 每级权限校验 + 逐级回落，校验失败自动降级 |
| 组织默认项目对部分用户不可见 | 同上，自动落到下一级；最终报明确错误 |
| `mcp_context` 中的历史脏数据（指向已删项目） | 隐式兜底校验失败即回落，不会把用户卡死 |

**回滚**：全部改动在 `feat/mcp-unified-backend` 分支；`MCP_ENABLED=false` 可单独关停 MCP。

### 4.9 已定稿的三项决策（2026-10-27）

| # | 议题 | 决定 |
|---|---|---|
| 1 | 工具名是否改名 | **保留** `set_project` / `get_current_project` 原名，不新增别名、不标 deprecated。无损优先 —— 存量客户端与 Skills 提示词按工具名引用，改名会打断它们。语义差异通过工具描述与新增返回字段 `source` 表达。 |
| 2 | 是否加显式 `catalogTags` | **加**。`find_explores` / `find_fields` 新增可选 `catalogTags`，优先级 `显式 catalogTags > mcp_context.tags`。纯增量，不改旧调用行为。纳入 P8.3 范围。 |
| 3 | 部署级 env 默认值 | **不提供默认值**。`mcp.defaultProjectUuid` 默认 `undefined`，由部署方显式配置 `LIGHTDASH_PROJECT_UUID`。多租户主站默认不设，避免误指向。 |

### 4.10 文案草案（实施时直接照抄）

> 工具描述一律英文（项目约定）。中文文案只出现在 `docs/` 文档里。

#### 4.10.1 共享常量（新增，避免 6 处重复）

在 `tools/projectContext.ts`（或 `tools/helpers.ts`）导出：

```ts
export const PROJECT_UUID_PARAM_DESCRIPTION =
    'Project UUID to use for this call. When omitted, resolves to the default ' +
    'project for the current user and organization, then the organization ' +
    'default, then the server default. An explicit value always takes precedence.';

export const NO_DEFAULT_PROJECT_ERROR =
    'No default project available. Call set_project to set one, or pass projectUuid explicitly.';

export const NO_DEFAULT_PROJECT_HINT =
    'Resolution order: explicit projectUuid > user default (set_project) > ' +
    'organization default > server default (LIGHTDASH_PROJECT_UUID).';
```

替换现有 6 处硬编码：

| 文件 | 现有文案 | 改为 |
|---|---|---|
| `tools/queryTools.ts` | `Project UUID to list the explores of. Defaults to the project set with set_project.` | `PROJECT_UUID_PARAM_DESCRIPTION` |
| `tools/queryTools.ts` | `Project UUID to run the query on. Defaults to the project set with set_project.` | `PROJECT_UUID_PARAM_DESCRIPTION` |
| `tools/contentSearchTools.ts` | `Project UUID to search in. Defaults to the project set with set_project.` | `PROJECT_UUID_PARAM_DESCRIPTION` |
| `tools/contentListTools.ts` | `Project UUID to list the spaces of. ...` / `... the space belongs to. ...` / `... the dashboard belongs to. ...` / `... list the verified content of. ...` | `PROJECT_UUID_PARAM_DESCRIPTION` |
| `tools/savedChartTools.ts` | `Project UUID the chart belongs to. Defaults to the project set with set_project.` | `PROJECT_UUID_PARAM_DESCRIPTION` |
| `tools/dashboardTools.ts` | `Project UUID the dashboard belongs to. Defaults to the project set with set_project.`（2 处） | `PROJECT_UUID_PARAM_DESCRIPTION` |
| `tools/chartRunTools.ts` | `Project UUID the chart belongs to. ...` / `... the dashboard belongs to. ...` | `PROJECT_UUID_PARAM_DESCRIPTION` |
| `McpService.ts` `getMcpCompatibleSchema()` | `Project to use for this call. Defaults to the project set with set_project.` | `PROJECT_UUID_PARAM_DESCRIPTION` |
| 6 个模块的 `resolveProjectUuid` 失败分支 | `No project context set. Use set_project or provide projectUuid parameter.` | `NO_DEFAULT_PROJECT_ERROR` + `NO_DEFAULT_PROJECT_HINT` |

#### 4.10.2 `set_project`

| 位置 | 内容 |
|---|---|
| 工具描述 | `Set the default project for subsequent MCP operations. This is a per-user, per-organization preference stored in the database; it does not affect other users. An explicit projectUuid argument on a tool call always takes precedence over this default.` |
| `projectUuid` 参数描述 | `Project UUID to use as the default. Must be a project you can view.` |
| `tags` 参数描述 | `Optional catalog tags to filter explores and fields by default. Overrides any previously stored tags. Pass an empty array to clear them.` |
| 返回结构 | **不变**：`{ projectUuid, projectName, selectedTags }` |
| 实现备注 | 写入前仍需 `projectService.getProject()` + CASL `view Project` 校验（现有逻辑不变）；`tags` 语义改为「默认标签」 |

#### 4.10.3 `get_current_project`

| 位置 | 内容 |
|---|---|
| 工具描述 | `Get the default project for the current user and organization, and show which fallback level it came from.` |
| 返回结构 | **新增** `source` 与 `hasUserDefault`，**保留**原有字段：<br>`{ projectUuid, projectName, selectedTags, source, hasUserDefault }`<br>`source` ∈ `user_default` \| `organization_default` \| `server_default` |
| 无可用默认时 | `{ error: 'No default project available. Call set_project to set one, or pass projectUuid explicitly.', hint: NO_DEFAULT_PROJECT_HINT }`（**保留 `error` 键**，仅换文案） |
| 兼容性 | 只做**新增**字段，不删改现有字段；`error` 字符串变更需在 `mcp-v2-guide.md` §7 错误表同步 |

#### 4.10.4 `catalogTags` 新参数

| 工具 | 参数描述 |
|---|---|
| `find_explores` | `Optional catalog tags to filter explores by. Overrides the tags stored by set_project for this call. Pass an empty array to disable tag filtering.` |
| `find_fields` | `Optional catalog tags to filter fields by. Overrides the tags stored by set_project for this call. Pass an empty array to disable tag filtering.` |

实现落点：`getFindExploresFunction()` / `getFindFieldsFunction()` 接受可选 `catalogTags`，计算 `effectiveTags = args.catalogTags ?? tagsFromContext`；`catalogTags: []` 视为「不过滤」（而不是回落到 context）。

#### 4.10.5 内置文档 `tools/mcpDocsContent.ts`

| 行 | 现有 | 改为 |
|---|---|---|
| 45 | `- Always pass \`projectUuid\` explicitly to query tools. The project set with \`set_project\` is only a convenience fallback.` | `- Always pass \`projectUuid\` explicitly to query tools. The default project set with \`set_project\` is only a convenience fallback and may be stale.` |
| 48 | `  - Project context: \`list_projects\`, \`set_project\`, \`get_current_project\`.` | `  - Project context: \`list_projects\`, \`set_project\`, \`get_current_project\`.`<br>**新增**：`  - Project resolution order: explicit \`projectUuid\` > user default (\`set_project\`) > organization default > server default.` |
| 84 | `3. Resolve the project with \`list_projects\` / \`set_project\`, or pass \`projectUuid\` to the tool call.` | `3. Resolve the project with \`list_projects\` / \`set_project\`, or pass \`projectUuid\` to the tool call. An explicit \`projectUuid\` always wins over any default.` |
| 153 | `- Business state that used to live in the session is now stored per user and organization in the database: \`set_project\` writes the current project for the calling user, and \`get_current_project\` reads it back. It survives restarts and works across replicas.` | `- Business state that used to live in the session is now stored per user and organization in the database: \`set_project\` writes the **default** project for the calling user, and \`get_current_project\` reads it back. It survives restarts and works across replicas. When no default is set, the organization default and then the server default are used.` |

#### 4.10.6 `tools/analystPrompt.ts` / `analystPromptTools.ts`

| 位置 | 现有 | 改为 |
|---|---|---|
| `analystPrompt.ts` | `Call list_projects if you do not know the project, then set_project with the chosen projectUuid, or pass projectUuid on the individual tool calls.` | `Call list_projects if you do not know the project, then set_project with the chosen projectUuid, or pass projectUuid on the individual tool calls. Prefer passing projectUuid explicitly on each call: the stored default may be stale.` |
| `analystPromptTools.ts` | `Optional project the agent should work on. The agent still has to select it with set_project.` | `Optional project the agent should work on. The agent still has to select it with set_project. Prefer passing this explicitly over relying on the stored default.` |

#### 4.10.7 文档

| 文件 | 改动 |
|---|---|
| `docs/mcp/mcp-v2-guide.md` §3.2 | 改写为四级兜底链 + 逐级回落规则；错误表同步 `NO_DEFAULT_PROJECT_ERROR`；新增 `get_current_project` 返回字段 `source` 说明 |
| `docs/mcp/mcp-tools-permissions.md` | `set_project` → 「为当前用户 + 当前组织记住**默认**项目（持久化到数据库，跨重启/跨副本一致）」；`get_current_project` → 「读取默认项目及其来源」 |
| `docs/mcp/mcp-unified-backend-plan.md` §3.2 | 同步四级链描述 |

## 5. 后续路线图（工具收敛 26 → 18）

> 本阶段**未启动**。收敛必须无损优先，且存量客户端与 Skills 提示词都按工具名引用，不能直接删。

**P8 收尾遗留（来自 2026-11-10 独立审查，均非阻塞）**：

- **观测口径**：`getTrackedProjectUuid()` 仍只读「显式参数 → mcp_context」，经组织级/部署级解析成功的工具调用 `mcp_tool_call.projectId` 为空，且 `source` 未进埋点——需跟随四级链更新。
- **性能**：组织级默认走 `OrganizationModel.get()`（附带查颜色调色板），可换轻量 `getDefaultProjectUuid(orgUuid)`。
- **copilot UX**：`catalogTags` 参数同时暴露给 EE AI copilot 的输入 schema，但 copilot 依赖实现忽略它（描述有「虚假承诺」嫌疑）；后续或让 copilot 支持，或 MCP 侧单独 extend schema。
- **语义文档**：`get_current_project` 在用户默认已失效回落时返回 `hasUserDefault: true` + `source: 'organization_default'`，`selectedTags` 仍来自失效 context——需在 guide 里写清组合语义。

**v2.1（无损）**：新增 `list_content`；参数化 `find_content` / `get_dashboard_tiles` / `get_site_info` / `list_projects`；旧工具标 deprecated，**输出结构不变**。

**v2.2（清理）**：删除 `get_lightdash_version` / `find_charts` / `find_dashboards` / `find_spaces` / `list_dashboards` / `list_charts` / `list_verified_content`。
（`set_project` / `get_current_project` **不再列入删除清单** —— 2026-10-27 修订后保留，见 §4。）

---

## 6. 上线排障记录（预发上线，2026-11-10）

### 6.1 迁移失败 `malformed array literal: "mcp:read"`（v2.6.8-test.2 修复）

- **现象**：`knex migrate:latest` 在 `20261012090000_add_mcp_read_scope_to_oauth_clients` 报 `malformed array literal: "mcp:read" / Array value must start with "{"`。
- **根因**：迁移写了 `SET scopes = scopes || 'mcp:read'`。PG 中字符串字面量是 **unknown 类型**，`||` 按「与另一参数同类型」规则被解析为**数组拼接**（`anyarray || anyarray`），把 `'mcp:read'` 当数组字面量解析失败。与表结构 / 数据无关，任何 PG 上必挂（`SELECT ARRAY['a'] || 'c'` 同样报错）。
- **修复**：改用 `array_append(scopes, 'mcp:read')`，`down` 用 `array_remove`（commit `f28a5a796`，随 `v2.6.8-test.2` 上线）。失败迁移未写入 `knex_migrations`，修复后直接重跑即可。
- **教训**：`array_col || 数字` 能跑（数字类型已知），`array_col || '字符串'` 必挂，只有裸字符串字面量踩坑；原生 SQL 迁移合并前应先在本地 / CI 真跑一遍 `migrate:latest`。

### 6.2 `prompts/list` 报 `field.isOptional is not a function`（v2.6.8-test.3 修复）

- **现象**：所有 MCP 客户端调 `prompts/list` 返回 `-32603 field.isOptional is not a function`，`tools/*` 正常。
- **根因**：`McpToolRegistry.registerPrompt` 误用 `server.prompt(name, config, cb)`。SDK 1.17.5 中三参 `prompt()` 重载是 `(name, argsSchema: ZodRawShape, cb)`，整个 `{description, argsSchema}` config 被包成 `z.object()`，list 时对字符串 `description` 调 `.isOptional()` 报错。config 对象形式只存在于 `server.registerPrompt(name, config, cb)`。
- **修复**：`server.prompt` → `server.registerPrompt`（commit `691057d50`，随 `v2.6.8-test.3` 上线）。
- **遗留**（SDK 1.17.5 自身行为，非 bug）：带参 prompt 的 `prompts/get` 必须传 `arguments` 对象（空参传 `{}`），否则 `-32602`。

### 6.3 上线版本链

| tag | 内容 |
|---|---|
| `v2.6.8-test.1` | MCP 统一后端首次上线预发（含 scopes 迁移 bug） |
| `v2.6.8-test.2` | 修复 scopes 迁移（§6.1），部署得以完成 |
| `v2.6.8-test.3` | 修复 `prompts/list`（§6.2） |

---

## 7. 参考资料

| 资料 | 路径 / 位置 |
|------|------------|
| 改造方案（完整） | `docs/mcp/mcp-unified-backend-plan.md` |
| 工具语义审计报告 | `/home/yzqzy/.pi/agent/herd/runs/2026-10-27_mcp-tools/mcp-tool-parity-report.md` |
| v2 参考分支 | `origin/feat/mcp-v2` |
| v2 工具清单 | `origin/feat/mcp-v2:packages/lightdash-mcp-v2/DEV_TOOL_NAMES.md` |
| v2 项目语义 | `origin/feat/mcp-v2:packages/lightdash-mcp-v2/src/mcp/tools/registerExploreCatalogTools.ts` |
| 线上独立包的 `set_project` 存储实现（内存 Map，**P8 方向判定的关键依据**） | `packages/lightdash-mcp/src/lib/mcpSessionStore.ts` |
| 线上独立包 `set_project` 工具注册 | `packages/lightdash-mcp/src/mcp/tools/registerSessionProjectTools.ts` |
| 组织级默认项目字段 | `packages/backend/src/database/entities/organizations.ts`（`default_project_uuid`）→ `packages/backend/src/models/OrganizationModel.ts` |
| v2 文档内容 | `origin/feat/mcp-v2:packages/lightdash-mcp-v2/src/mcp/mcpDocsContent.ts` |
| 独立包 v1 实现 | `packages/lightdash-mcp/src/mcp/` |
| 独立包鉴权 | `packages/lightdash-mcp/src/http/authAndCache.ts`（已有 `validateOauthToken()`） |
| MCP context migration | `packages/backend/src/database/migrations/20250811180000_create_mcp_context_table.ts` |
| MCP context model | `packages/backend/src/models/McpContextModel.ts` |

**Herd 任务记录**（run `2026-10-27_mcp-tools`）：`j01`/`j04` aborted；`j02`/`j03`/`j05`/`j20`/`j21`/`j22`/`j23` accepted；`j39`（parity 调研报告）completed。
