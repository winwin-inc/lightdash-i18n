# MCP 统一改造方案：主站非 EE `/api/v1/mcp`

> 分支：`feat/mcp-unified-backend`
> 目标：把独立包 `packages/lightdash-mcp` 的工具能力，整体合并进主站后端 `/api/v1/mcp`，
> 并把 MCP 从 EE 目录迁到非 EE，鉴权统一到主站自建 OAuth。

---

## 1. 背景

仓库里目前有三份 MCP 实现：

| 资产 | 位置 | 工具 | 会话 | 鉴权 |
|---|---|---|---|---|
| 主站 EE MCP | `backend/src/ee/services/McpService/` | 10 | 无状态 | Lightdash OAuth + PAT |
| 独立包 v1 | `packages/lightdash-mcp` | 27 + prompt | 有状态（registry/LRU/TTL） | PAT + OAuth introspect |
| 独立包 v2（分支） | `origin/feat/mcp-v2:packages/lightdash-mcp-v2` | 27 | 无状态（sessionless） | Keycloak JWKS + 换票 |

独立包存在的唯一理由（`docs/lightdash-mcp/architecture.md` 自述）：**主站内置 MCP 是 EE + 依赖商业能力，OSS 自托管用不了**。
一旦 MCP 下沉到主站非 EE，这个理由消失，独立包降级为过渡资产。

---

## 2. 已确认的决策

| 决策项 | 结论 | 理由 |
|---|---|---|
| 目录 | MCP 全部移到非 EE（`backend/src/services/McpService/`、`common/src/schemas/mcp/`），**不留在 `ee/` 目录** | OSS 自托管也要能用 |
| 会话 | **无状态**，不引入 `Mcp-Session-Id` | 主站已是无状态；多副本无需粘性会话；"当前项目"用 PG `mcp_context` 持久化即可 |
| 鉴权 | **只用主站自建 OAuth**（+ 保留 PAT 兼容老客户端），**不做** Keycloak/外部 IdP | 主站 OAuth 已具备 DCR + PKCE + RFC9728 发现，够用 |
| 独立包 | **暂时保留**，本次不动；后续转薄壳/退役 | 避免一次性打断存量客户端 |
| 工具实现 | 直接调 backend service，**不**把独立包的 REST 客户端搬进主站 | 避免进程内 HTTP 自环，保留 CASL / 行级属性 / 缓存能力 |

---

## 3. 目标结构

```
packages/common/src/schemas/mcp/            ← MCP 工具 zod schema（从 common/src/ee/AiAgent/schemas/tools 迁出）
packages/backend/src/services/McpService/   ← MCP 主服务（非 EE）
  McpService.ts                编排：工具注册 + 上下文 + 鉴权注入
  McpToolName.ts               工具名枚举
  tools/{org,session,explore,content,query,saved,dashboard,docs}.ts
packages/backend/src/services/ai/            ← MCP 需要的 AI 工具公共部分（从 ee/services/ai 迁出，EE 侧改为引用）
packages/backend/src/routers/mcpRouter.ts   ← 无状态 transport + OAuth/PAT 鉴权 + RFC9728 头
```

### 3.1 请求链路

```
MCP Client ──POST /api/v1/mcp──▶ mcpRouter
   │ Authorization: Bearer <Lightdash OAuth token>  → allowOauthAuthentication
   │ x-api-key / Authorization: ApiKey <PAT>         → allowApiKeyAuthentication
   ▼
McpService（单例、无状态；user + ability 按请求注入）
   ▼ 直接调用
CatalogService / ContentService / SavedChartsService / DashboardService /
SpaceService / AsyncQueryService / ProjectModel / McpContextModel
```

### 3.2 上下文（无状态下的"当前项目"）

- `set_project` / `get_current_project` **保留**，写入已有的 PG 表 `mcp_context`（`user_uuid` + `organization_uuid` 维度）。
  相比独立包的进程内存：跨实例、跨重启、不随连接失效。
- 所有需要项目的工具同时支持显式 `projectUuid` 参数覆盖上下文。

### 3.3 鉴权

- 保留现有 `allowOauthAuthentication`（主站自建 OAuth2：`/oauth/register` DCR、`/oauth/authorize` PKCE、`/oauth/token`、`/oauth/introspect`、`/oauth/revoke`）。
- 保留 PAT 通道，避免打断存量独立包客户端。
- **补齐 scope 校验**：`McpService.canAccessMcp()` 中被注释掉的 `mcp:read` / `mcp:write` 校验恢复，按工具读写属性区分。
- 401 响应继续带 `WWW-Authenticate: Bearer resource_metadata="…"`（RFC 9728）。
- **不引入** Keycloak / 外部 OIDC bearer（本次范围外）。

---

## 4. 工具矩阵（27 个）

| 工具 | 实现来源 | 状态 |
|---|---|---|
| `get_lightdash_version` | `VERSION` | 已有，迁出 |
| `get_site_info` | `lightdashConfig.siteUrl` | 新增（S） |
| `get_my_access` | `user.ability` + 组织角色 + 可查表 | 新增（M） |
| `list_projects` | `ProjectModel.getAllByOrganizationUuid` | 已有，迁出 |
| `set_project` / `get_current_project` | `McpContextModel`（PG） | 已有，迁出 |
| `list_explores` | `ProjectModel.findExploresFromCache` + 属性/标签过滤 | 新增（M） |
| `find_explores` / `find_fields` | `CatalogService.searchCatalog` | 已有 |
| `find_charts` / `find_dashboards` | `SearchModel` / `ContentService` | 已有 |
| `find_spaces` / `find_content` / `list_spaces` / `list_charts` / `list_dashboards` / `list_verified_content` | `ContentService`(v2 content) + `SpaceService` | 新增（M×6） |
| `search_field_values` | `CatalogService` | 已有 |
| `run_metric_query` | `AsyncQueryService` + 指标查询 | 已有 |
| `run_semantic_metric_query` | `AsyncQueryService` + 语义层 metricQuery | 新增（M） |
| `get_saved_chart` / `run_saved_chart` | `SavedChartsService` | 新增（M×2） |
| `get_dashboard_tiles` / `run_dashboard_tiles` / `get_dashboard_code` | `DashboardService` | 新增（M×3） |
| `get_mcp_docs` + `lightdash-analyst` prompt | 静态文案 | 新增（S） |

---

## 5. 实施阶段

| 阶段 | 内容 | 规模 | 验收 |
|---|---|---|---|
| P0 | 分支 + 本方案文档 | S | 评审通过 |
| P1 | 目录搬迁：MCP 迁出 `ee/`；MCP 依赖的 ai 工具/类型/工具函数迁到非 EE；`ServiceRepository` 改基础工厂；EE provider 删除 | M | `pnpm -F common typecheck` + `pnpm -F backend typecheck` + 现有 10 工具回归 |
| P2 | 鉴权重构：OAuth/PAT 统一到 `McpAuthContext`；恢复 scope 校验 | M | 三条路径冒烟；缺 scope 403 |
| P3 | 无状态定稿：不引入 `Mcp-Session-Id`；`set_project` 落 PG；工具支持 `projectUuid` 覆盖 | S-M | 多用户/多组织上下文不串 |
| P4 | 工具补齐（按 content/space → saved chart/dashboard → semantic query/access/docs 分批） | L | 每个工具有单测；与独立包输出快照对比 |
| P5 | 工具输出去 ai SDK 包装，改为 MCP 原生格式（参考独立包 `lib/toolOutput.ts`） | M | AI Copilot 无回归 |
| P6 | 观测：`/api/v1/mcp/health`；结构化日志；`pnpm generate-api` 更新 swagger | S-M | 健康检查可用 |
| P7 | 独立包退役评估 + 文档重写 | S | — |

### 进度（2026-10-27）

| 阶段 | 状态 | 说明 |
|---|---|---|
| P0 | ✅ | 分支 `feat/mcp-unified-backend` + 本文档 + `docs/mcp/mcp-tool-porting-guide.md` |
| P1 | ✅ | commit `23bf6df91`：MCP 与 AI 公共工具迁出 `ee/`，`ServiceRepository` 基础工厂接管 |
| P2 | ✅ | commit `db812ab56`：OAuth/PAT 统一 `McpAuthContext`，恢复 `mcp:read`/`mcp:write` 校验，路由层缺 scope 返回 403 |
| P3 | ✅ | commit `863761bc6` + 后续提交：无状态（无 `Mcp-Session-Id`）、上下文落 PG（user+organization 维度）、项目型工具支持显式 `projectUuid` 覆盖、MCP schema 去掉 AI agent 的 `type` 判别字段、引入 `McpToolRegistry` 工具注册框架 |
| P4 | ✅ | 已完成全部 26 个工具：`get_site_info`（orgTools）、`get_my_access`（accessTools）、`get_mcp_docs`（docsTools）、`list_explores` + `run_semantic_metric_query`（queryTools）、`find_*`（contentSearchTools）、`list_*`（contentListTools）、`get_saved_chart`（savedChartTools）、`get_dashboard_code` / `get_dashboard_tiles`（dashboardTools）、`run_saved_chart` / `run_dashboard_tiles`（chartRunTools）；每个模块含单测 |
| P5 | ✅ | 6 个 AI-SDK 包装的 MCP 工具抽出原生实现（`runFindExplores` / `runFindFields` / `runFindDashboards` / `runFindCharts` / `runRunMetricQuery` / `runSearchFieldValues`），MCP 侧不再经过 AI SDK，错误不再被压平，EE AI agent 继续使用原包装 |
| P6 | ✅ | `GET /api/v1/mcp/health`；工具调用埋点统一收口到 `McpToolRegistry`（`mcp_tool_call` 事件新增 `authType`/`durationMs`/`success`）；路由层鉴权结构化日志；`pnpm generate-api` 重新生成 swagger |
| P7 | ⬜ | 待办 |

### 风险与回滚

- **风险 1：漏迁 EE 依赖** → P1 以 typecheck 卡口；EE AI Copilot 侧保留原实现并行一个版本再删。
- **风险 2：多副本内存态** → 独立包的 `sharedExploreCache` 等迁到主站 `CacheService`。
- **风险 3：鉴权收窄打断老客户端** → PAT 通道保留；独立包暂不动。
- **回滚**：全部改动在新分支；`MCP_ENABLED` 可单独关停 MCP。

---

## 6. 配置项

```
MCP_ENABLED                 # 已有：MCP 总开关
MCP_OAUTH_REQUIRED_SCOPES   # 新增：Lightdash OAuth 侧默认 mcp:read
```

（本次不引入 Keycloak 相关配置。）
