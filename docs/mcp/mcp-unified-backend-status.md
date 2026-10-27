# MCP 统一改造归档（分支 `feat/mcp-unified-backend`）

> **归档日期**：2026-10-27
> **状态**：⏸️ **已暂停开发**（用户决定：先不开发"主站无状态项目模型"）
> **分支**：`feat/mcp-unified-backend`（未合入主干，代码可完整保留）
> **恢复方式**：切回该分支，从本文档 [§4 未完成工作](#4-未完成工作主站无状态项目模型) 继续；调研结论已全部沉淀，无需重做。

---

## 1. 一句话现状

主站 MCP 已完成 P1–P7 全部阶段：核心能力从 `src/ee/` 下沉到非 EE 后端、鉴权统一为「OAuth + PAT」并落实 scope 校验、26 个工具全部模块化迁移并带单测、埋点收口、健康检查与文档齐备。

**唯一未落地的是最后一步：移除 `set_project` / `get_current_project`，把 MCP 的"当前项目"从 PG 状态改为完全无状态。** 该步骤的调研已全部完成，实施方案见 §4。

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

---

## 4. 未完成工作：主站无状态项目模型

> ⏸️ **本节已暂停实施**（调研已完成，代码未改动）。

### 4.1 目标

移除 `set_project` / `get_current_project`，删除 MCP 对 `mcp_context` 表的依赖，使主站工具集从 **26 → 24**，与 `origin/feat/mcp-v2` 完全一致。

### 4.2 调研结论（已完成，代码未改动）

**① 差异已精确定位**

`origin/feat/mcp-v2` 的 `packages/lightdash-mcp-v2/DEV_TOOL_NAMES.md` 明确为 **24 个工具**。与当前主站 26 个的差异**恰好只有** `set_project` 与 `get_current_project`。移除后集合完全一致。

**② v2 的项目语义**

`origin/feat/mcp-v2:packages/lightdash-mcp-v2/src/mcp/mcpDocsContent.ts` 与 `.../tools/registerExploreCatalogTools.ts` 明确：每次调用显式传 `projectUuid`，或由服务端环境变量 `LIGHTDASH_PROJECT_UUID` 提供；**不保存 Session、不存在"当前项目"记忆**。

**③ 主站现状（仍是状态化）**

- `McpService` 注册 `SET_PROJECT` / `GET_CURRENT_PROJECT`
- `McpContextModel` 注入 `McpToolDeps`
- `McpService.getProjectUuidFromContext()` / `getTagsFromContext()` / `resolveProjectUuid()` / `getTrackedProjectUuid()` 读取 `mcp_context`
- `set_project` 可保存 `tags`，用于 explore 标签过滤（`getTagsFromContext()` → `filterExploreByTags` + `catalogSearch.yamlTags`）
- `mcp_context` key = `user_uuid + organization_uuid`；除 `McpService` 外**无其他消费者**（EE 中仅 `packages/backend/src/ee/index.ts` 注入 model）
- migration 来源 commit：`bd5a296d5 feat: add MCP context table and project selection tools (#16339)`
- migration 文件：`packages/backend/src/database/migrations/20250811180000_create_mcp_context_table.ts`（**已在 `origin/main` 存在**）
- 模型文件：`packages/backend/src/models/McpContextModel.ts`；`ModelRepository.getMcpContextModel()` 返回实例
- 六个工具模块各自复制了一份 `resolveProjectUuid`：
  `queryTools.ts` / `contentSearchTools.ts` / `contentListTools.ts` / `savedChartTools.ts` / `dashboardTools.ts` / `chartRunTools.ts`
- 当前模块级解析错误文案：`ForbiddenError('No project context set. Use set_project or provide projectUuid parameter.')`
- 前端 / common **未引用** `set_project` / `get_current_project`

**④ tags 能力的归属**

v2 把 `catalogTags` 提为 `find_explores` / `find_fields` 的**显式参数**。主站 `find_explores` / `find_fields` 走的是 AI agent 的 `findExploresFn` / `findFieldsFn`（参数核心为 `exploreName` / `table`），与 v2 的 catalog 检索型实现**参数集与执行路径都不同**——不能仅凭同名判断一致。

因此：`tags` 若要保留，需在主站 `find_explores` / `find_fields` 上新增等价显式参数（如 `catalogTags`），替代 `getTagsFromContext()`。

**⑤ 可用的兜底来源**

- `Organization` 类型已含 `defaultProjectUuid`；`OrganizationModel.get(organizationUuid)` 读取 `default_project_uuid`；`OrganizationService.get()` 可取得
- 该字段属于**组织配置**，不是用户个人项目（`UserService` 更新组织时不设置它）
- `ProjectService.getProject(projectUuid, account)` 内部已执行 `account.user.ability.cannot('view', subject('Project', ...))` 并抛 `ForbiddenError`
- `packages/common/src/ee/AiAgent/filterExploreByTags.ts` 提供了基于 catalog tags 的 explore 过滤逻辑，可复用

**⑥ 配置现状**

`packages/backend/src/config/parseConfig.ts` 的 `mcp` 配置目前只有 `enabled` 与 `oauthRequiredScopes`，**尚无** `LIGHTDASH_PROJECT_UUID` 对应字段。

**⑦ 语义提醒**

工具名一致 ≠ 语义一致。v2 的 `find_explores`（`searchQuery` + `catalogTags` + `full`，走 data catalog `type=table`）与主站的 `find_explores`（`exploreName`，走 AI agent）是**两个不同的东西**。全面对齐属于后续"工具收敛"阶段，不应与本次无状态化混做。

### 4.3 待实施方案（尚未执行）

**Step 1 — 删除两个工具**

- `packages/backend/src/services/McpService/McpToolName.ts`：删除 `SET_PROJECT` / `GET_CURRENT_PROJECT`
- `packages/backend/src/services/McpService/tools/scopes.ts`：删除对应 `MCP_TOOL_SCOPES` 条目
- `packages/backend/src/services/McpService/McpService.ts`：删除两个注册块（约 441–560 行区间）
- 工具数 26 → 24

**Step 2 — 移除 `mcpContextModel` 依赖**

- `packages/backend/src/services/McpService/tools/deps.ts`：从 `McpToolDeps` 删除 `mcpContextModel`
- `packages/backend/src/services/McpService/McpService.ts`：`McpServiceArguments`、类字段、构造参数、`getToolDeps()` 全部移除
- `packages/backend/src/services/ServiceRepository.ts`：`getMcpService()` 移除注入
- `packages/backend/src/ee/index.ts`：删除无消费者的 `mcpContextModel` provider 及 import

**Step 3 — 统一无状态项目解析**

抽取共享 helper（例如 `tools/projectContext.ts`），签名类似：

```ts
resolveProjectUuid(deps, context, explicitProjectUuid?: string): Promise<string>
assertCanViewProject(deps, context, projectUuid): Promise<void>
```

替换六个模块中重复的 `resolveProjectUuid`，并让 `McpService.resolveProjectUuid()` 委托给它。

**Step 4 — 确定并实现兜底优先级（未最终定稿）**

候选顺序：

1. 显式 `args.projectUuid`
2. 服务端 `LIGHTDASH_PROJECT_UUID`（需在 `parseConfig.ts` 新增 `mcp.defaultProjectUuid`）
3. 组织级 `defaultProjectUuid`（需注入 `OrganizationModel` / `OrganizationService`）
4. 都没有 → 抛 `ForbiddenError`，文案需去掉 `set_project` 提示

> ⚠️ **注意**：主站是多租户。`LIGHTDASH_PROJECT_UUID` 是**部署级**全局值，若排在组织默认值之前，在多租户场景会把其他组织的请求导向同一个项目。因此实施时需确认：是否改为「先组织默认值、再环境变量」，或对环境变量兜底加组织归属校验。
>
> 无论哪一层兜底，最终都必须再走一次 `ProjectService.getProject()` + CASL `view Project` 校验。

**Step 5 — tags 无状态化**

为 `find_explores` / `find_fields` 增加显式 `catalogTags`（或等价）参数，替代 `getTagsFromContext()`；默认缺省时行为等同当前"未 `set_project`"的路径。

**Step 6 — `mcp_context` 表与模型处置（未决策）**

- **migration 文件**：`20250811180000_create_mcp_context_table.ts` 已在 `origin/main` 存在并可能已部署。删除已上线的 migration 会破坏迁移历史，**倾向保留**。
- **模型文件**：`packages/backend/src/models/McpContextModel.ts` 及其 `ModelRepository` 入口可删除（无消费者）。
- 若确需删表，应新增独立的下行 migration，而非改历史 migration。
- 无论保留与否，**必须保证 MCP 服务完全不再依赖该表**。

**Step 7 — 测试更新**

- `packages/backend/src/services/McpService/McpService.tools.test.ts`：26 → 24
- `packages/backend/src/services/McpService/McpService.context.test.ts`：移除 context mock / 断言，改为覆盖无状态解析
- 各工具模块测试：移除 `mcpContextModel` mock

**Step 8 — 文档更新**

- `docs/mcp/mcp-v2-guide.md`
- `docs/mcp/mcp-unified-backend-plan.md`
- `packages/backend/src/services/McpService/tools/mcpDocsContent.ts`（去掉有状态项目说明、移除 `session_lifecycle` topic）
- `packages/backend/src/services/McpService/tools/analystPrompt.ts` / `analystPromptTools.ts`（提示词里提到 `set_project`）
- `docs/mcp/mcp-tools-permissions.md`（工具与权限对照表含 `set_project` / `get_current_project`）

**Step 9 — 回归验证**

```bash
cd packages/backend && NODE_OPTIONS=--max-old-space-size=6144 npx tsc --project tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=4096 npx eslint -c .eslintrc.js --ignore-path ./../../.gitignore src/services/McpService src/services/ai src/routers/mcpRouter.ts
NODE_OPTIONS=--max-old-space-size=4096 TZ=UTC npx jest --config jest.config.js src/services/McpService src/routers/mcpRouter.test.ts
```

> 后端 typecheck 在默认 Node heap 下会 OOM，必须带 `--max-old-space-size=6144`。

### 4.4 仍未定的问题

1. `LIGHTDASH_PROJECT_UUID` 与组织级 `defaultProjectUuid` 的**先后顺序**及多租户安全性
2. `mcp_context` 表是否 drop，以及 migration / model 的最终处置
3. 主站 `find_explores` / `find_fields` 是否在本轮就向 v2 的参数模型靠拢，还是留到工具收敛阶段

---

## 5. 后续路线图（工具收敛 26 → 18）

> 本阶段**未启动**。收敛必须无损优先，且存量客户端与 Skills 提示词都按工具名引用，不能直接删。

**v2.1（无损）**：新增 `list_content`；参数化 `find_content` / `get_dashboard_tiles` / `get_site_info` / `list_projects`；旧工具标 deprecated，**输出结构不变**。

**v2.2（清理）**：删除 `get_lightdash_version` / `find_charts` / `find_dashboards` / `find_spaces` / `list_dashboards` / `list_charts` / `list_verified_content`。
（`get_current_project` 若 §4 已实施，则已在该阶段前移除。）

---

## 6. 参考资料

| 资料 | 路径 / 位置 |
|------|------------|
| 改造方案（完整） | `docs/mcp/mcp-unified-backend-plan.md` |
| 工具语义审计报告 | `/home/yzqzy/.pi/agent/herd/runs/2026-10-27_mcp-tools/mcp-tool-parity-report.md` |
| v2 参考分支 | `origin/feat/mcp-v2` |
| v2 工具清单 | `origin/feat/mcp-v2:packages/lightdash-mcp-v2/DEV_TOOL_NAMES.md` |
| v2 项目语义 | `origin/feat/mcp-v2:packages/lightdash-mcp-v2/src/mcp/tools/registerExploreCatalogTools.ts` |
| v2 文档内容 | `origin/feat/mcp-v2:packages/lightdash-mcp-v2/src/mcp/mcpDocsContent.ts` |
| 独立包 v1 实现 | `packages/lightdash-mcp/src/mcp/` |
| 独立包鉴权 | `packages/lightdash-mcp/src/http/authAndCache.ts`（已有 `validateOauthToken()`） |
| MCP context migration | `packages/backend/src/database/migrations/20250811180000_create_mcp_context_table.ts` |
| MCP context model | `packages/backend/src/models/McpContextModel.ts` |

**Herd 任务记录**（run `2026-10-27_mcp-tools`）：`j01`/`j04` aborted；`j02`/`j03`/`j05`/`j20`/`j21`/`j22`/`j23` accepted；`j39`（parity 调研报告）completed。
