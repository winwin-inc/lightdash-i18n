# Lightdash MCP 强制看板模式（v2，已实施）

> **状态：已实施（v2），合入分支 `feat/mcp-dashboard-strict`。** 代码位置：`packages/lightdash-mcp/src/lib/requiredDashboardContext.ts`（唯一闸门）+ `packages/backend` 的 `associatedCount`。本文描述目标行为、环境变量、权限口径与返回契约；实现与设计的细微差异集中在 §10.4。
>
> 关联阅读：[MCP 看板上下文](./mcp-dashboard-context.md)、[client-use 内容可见性](../features/client-use-viewer-content-scope.md)、[上线流程](./mcp-service-launch.md)、[工具与权限对照](./mcp-tools-permissions.md)、[包 README](../../packages/lightdash-mcp/README.md)。

## 0. v2 相对 v1 的变更

| # | v1（上一版） | v2（本版） | 原因 |
|---|--------------|-----------|------|
| 1 | 覆盖范围表述模糊，隐含"只在 `sql_filter` 依赖 `dashboardSlug` 时才强制" | **A 方案**：开关打开后，**所有会执行查询的工具一律必须解析出 `dashboardUuid`**，与 explore 是否依赖 `dashboardSlug` 无关 | 安全性不能押在 dbt 元数据检测完备性上：检测侧只做字符串包含且只看 base table（`src/mcp/fieldIdResolver.ts:11-31`），执行侧也只应用 base table 的 `sqlWhere`（`src/utils/QueryBuilder/MetricQueryBuilder.ts:745`） |
| 2 | 0 候选时调 `GET /api/v1/user?projectUuid=` 读 `clientUse.scopeApplied`，按角色区分"权限 / 配置" | **删除整段**。改为由 `/dashboards/context` 返回权限过滤前的关联看板数（`associatedCount`），据此分流 | `scopeApplied` 只回答"当前用户是否被收窄"，不回答"该 explore 有没有绑看板"，是错的 oracle；两种误判都会把客户/客服带偏。⚠️ 2026-11 起该字段**仅用于选择预检文案的口吻**（§9.7），不参与"权限 / 配置"判定 |
| 3 | 显式 `dashboardUuid` 校验失败可降级 | 预检失败**一律阻断**，并要求 `projectUuid` 归属一致 | 现状 `dashboardContextResolver.ts:202` 把 `getDashboard` 的错误整段 `catch {}` 吞掉并伪造 `resolved`，严格模式下等于放行 `NA` |
| 4 | 多候选"必须选择" | 保留，且要求 resolver 真正返回 `needs_selection` | 现状 `resolve()` 从不返回该状态（类型里有、三个调用点判断它是死分支），实际是取排序第一个 |
| 5 | `search_field_values` 只提"禁用 SQL 回退" | 补齐：解析 → field search 带 uuid → 空结果只允许回退到**带 uuid 的 metric-query** | 现状空结果（`FIELD_VALUES_EMPTY`）会直接掉进裸 SQL DISTINCT，绕过 `sql_filter` |
| 6 | 未提 `run_saved_chart` 的接口选择 | 明确必须走 `/query/dashboard-chart`，禁止走 `/query/chart` | `/query/chart` 不接受 `dashboardUuid`，永远落 `NA` |
| 7 | §4.3 建议 `get_my_access` 不新增字段 | 改为暴露 `dashboardStrict` / `dashboardContact` | 让 agent 一次问清策略，避免靠失败试错 |
| 8 | 显式 uuid 只校验“能打开” | 新增 §4.4：显式 uuid 必须属于该 explore / chart 的关联候选 | 否则可以“看板 A + 图表 B”任意配对，放宽 `sql_filter` 的类目分支 |
| 9 | 未讨论 PAT 直连 | 新增 §12 残余风险 | MCP 层是护栏，客户持 PAT 仍可直连后端 |
| 10 | `run_saved_chart` 接口切换未提 `versionUuid` | §8.1 / §11 声明严格模式忽略 `versionUuid` | `/query/dashboard-chart` 不支持该参数 |

## 1. 背景

部分 dbt 模型的 `sql_filter` 会引用 `lightdash.user.dashboardSlug`。查询没带看板上下文时，后端把三个看板属性统一填 `NA`（`packages/common/src/types/user.ts:235-245`），`sql_filter` 的第一个分支可能恒为真，导致：

- 返回比看板 UI 更宽的数据（行级类目过滤未生效）；
- 外部客户看到不属于自己的数据。

面向外部客户的 MCP 部署需要一层**强制看板模式**：查询类工具必须解析出 `dashboardUuid` 才能执行；解析不出时明确告诉调用方"必须配置看板 / 申请看板权限"，而不是静默按 `NA` 查询。

## 2. 现行代码事实（实施基线）

### 2.1 后端：给了 `dashboardUuid` 就 fail-closed，不给就 fail-open

| 入口 | 未传 dashboard 上下文 | 传了但无法验证 |
|------|----------------------|----------------|
| `POST /api/v2/projects/:p/query/metric-query` | `resolveDashboardContextForQuery` 直接返回 `undefined`（`ProjectService.ts:4633-4649`）→ 落 `NA`，**不报错** | `ForbiddenError`（`ProjectService.ts:4755-4759`） |
| `POST /api/v2/projects/:p/query/chart` | 接口**不接受** `dashboardUuid`，恒 `NA`（`AsyncQueryService.ts:2191-2202`） | — |
| `POST /api/v2/projects/:p/query/dashboard-chart` | 参数必填，缺省直接 422（`routes.ts:25048`） | `ForbiddenError('Dashboard does not belong to project')`（`AsyncQueryService.ts:2493-2503`） |
| `POST /api/v1/projects/:p/field/:fieldId/search` | 落 `NA`，正常返回 | `ForbiddenError`（`ProjectService.ts:3854-3862`） |

校验链（服务端权威，MCP 不要重复实现）：`DashboardService.resolveDashboardContextForMetadata`（`DashboardService.ts:800-922`）做 project 内查找 → CASL space 权限（403 `You don't have access to the space this dashboard belongs to`）→ client-use 白名单（403 `You don't have access to this dashboard`）；`getByIdOrSlug` 的对外接口在 `DashboardService.ts:1251-1331`，白名单拒绝文案是 `You don't have permission to view this dashboard. Please contact your administrator to configure dashboard access permissions.`；不存在时 404 `Dashboard not found`（`DashboardModel.ts:1266-1270`）。

`GET /api/v1/dashboards/:uuid`（`routers/dashboardRouter.ts:10-26`）**不做项目归属校验**：`_options.projectUuid` 被标注 ignored（`DashboardService.ts:1254-1256`），且返回的是**完整看板对象**（含 tiles / filters）。MCP 必须自行比对 `projectUuid`，跨项目命中时不得回显任何看板内容。

### 2.2 后端：反查接口分不清"没有看板"和"没有权限"

`DashboardService.getDashboardContexts`（`DashboardService.ts:1173-1249`）先取 `rows`（`:1186`，已按项目 + explore/chart 关联、只含最新 dashboard 版本的 chart 磁贴），再按 CASL / 空间 / client-use 白名单过滤（`:1203-1233`），只返回过滤后的 `contexts`。**权限过滤前的数量没有暴露**，因此 0 候选时调用方无法判断是自己没权限还是数据集没绑看板。

`DashboardModel.findDashboardContexts`（`DashboardModel.ts:643-776`）只统计"最新 dashboard 版本里挂了 saved chart tile"的看板。已知计数口径问题：`exploreName` 过滤内连 `saved_chart_versions` 但**不限定 chart 版本**（`DashboardModel.ts:750-761`），历史版本用过该 explore 的看板也会计入，可能把"没配看板"算成"有看板"。实施时计数口径需与 `getExploreNamesByDashboardUuids` 对齐（只算最新 chart 版本）。

### 2.3 MCP：严格模式的四处缺口

1. `dashboardContextResolver.resolve()` 显式 uuid 分支吞错（`dashboardContextResolver.ts:182-214`，`catch {}` 在 `:202`）。
2. `needs_selection` 不可达（`dashboardContextResolver.ts:33-48` 有类型，`resolve()` 无返回），三个调用点的判断是死分支（`registerQueryTools.ts:492-498`、`:653-659`、`registerExtensionTools.ts:274-280`）。
3. 0 候选时返回 `dashboard_selection_required` + `candidates: []`（`dashboardContextResolver.ts:91-113`，调用点 `registerQueryTools.ts:499-508`、`:660-669`、`registerExtensionTools.ts:281-290`）——"让你选"与"空列表"自相矛盾。
4. `search_field_values` 未接 resolver，且空结果回退裸 SQL（`registerQueryTools.ts:239-258`、`:267-297`），metric-query 回退也不带 uuid（`:326-373`）。

其他：`requestBase.ts:49-76` 只抛 `Error('Lightdash API <status>: …')`，无 `status` 字段；全仓 403 结构判断只有一处正则（`registerContentTools.ts:266`）。

## 3. 环境变量

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `MCP_DASHBOARD_STRICT` | 否 | `false` | 强制看板模式总开关。**仅外部品牌 CT 部署设 `true`**；内部不设或 `false` |
| `MCP_DASHBOARD_CONTACT` | 否 | `请联系客服开通看板访问权限。` | 无权限时的联系文案，可填电话 / 群 / 邮箱 |
| `LIGHTDASH_PUBLIC_SITE_URL` | 否 | 同 `LIGHTDASH_SITE_URL` | 生成看板链接的浏览器根地址（已有配置，`config.ts:77-80`） |

看板链接格式：

```text
{publicBaseUrl}/projects/{projectUuid}/dashboards/{dashboardUuid}/view
```

约束：

- 不把前端客服手机号 / 微信号硬编码进 MCP；需要时通过 `MCP_DASHBOARD_CONTACT` 配置。
- 受限用户打开链接会进入现有 `NoDashboardPermission` 页面，页面本身已有客服信息。

## 4. 核心决策

### 4.1 要求是"必须解析出 dashboardUuid"，且与身份无关

- 开关打开后，**所有会执行查询的工具**都必须先拿到一个已验证的 `dashboardUuid`，拿不到就不查数。
- **不按角色分流**：viewer / interactive_viewer / editor / admin 走同一套要求。原因：
  - 数据安全口径不能随调用者身份变化，否则同一个问题两种答案；
  - 外部部署里 editor / admin 也可能看不到某张看板，按角色放行等于给一条绕过路径；
  - 内部管理员如需宽松口径，用内部部署（`MCP_DASHBOARD_STRICT=false`）。
- 权限判断**全部留在后端**：项目角色、空间权限、client-use 白名单都由 backend 执行（§2.1），MCP 只做"必须带上下文"+"把 403/404 翻译成可读提示"。

### 4.2 解析顺序（严格模式）

1. **显式 `dashboardUuid`**（含 `run_semantic_metric_query` 从 metricQuery JSON 内解析出的那个，独立参数优先）。实现顺序是"先反查再预检"，以避免无谓的看板访问副作用（见 §10.4）：
   1. 按 `exploreName` / `chartUuid` 反查 `/dashboards/context`；
   2. **uuid 命中候选** → 直接用候选的 `uuid` / `slug` / `name`（**不**调 `GET /dashboards/{uuid}`）；
   3. 未命中且 `associatedCount === undefined` → `dashboard_context_unavailable`；`=== 0` → `dashboard_configuration_required`；
   4. 未命中且 `associatedCount > 0` → 调 `GET /api/v1/dashboards/{uuid}`：403 → `dashboard_permission_required`；404 / 跨项目 / 确实未关联 → `dashboard_not_found`（未关联时附候选）；其他错误 → `dashboard_context_unavailable`；
   5. 支持直接传 slug（`getDashboard` 返回的 canonical uuid 会再与候选比对一次）。
   - **显式 uuid 必须属于该 explore / chart 的关联看板集合**，否则同样阻断（见 §4.4）。
   - **以上任一失败都不执行查询，也不降级为 `NA`。**
   - 口径优先级：“没配看板”（`associatedCount === 0`）优先于“没权限”，即使调用方显式传了一个自己打不开的 uuid。
2. **未显式传**：先做工具自身的既有校验（`assertExploreQueryable` / saved chart 元数据），再按 `exploreName` 或 `chartUuid` 反查 `/dashboards/context`。
   - **1 个** → 自动使用，`source = uniqueExploreContext | uniqueChartContext`，结果里回显 `dashboardUuid` 并提示"对外查询建议显式传参"。
   - **≥2 个** → `dashboard_selection_required`，返回候选（含 `dashboardUrl`），**不执行查询**，由调用方选择后重试。
   - **0 个** → 用响应里的 `associatedCount` 分流（§4.3）。
3. 反查接口本身失败 → `dashboard_context_unavailable`（可重试）。

### 4.2.1 预检开销

显式 `dashboardUuid` 每次查询会多一次 `GET /api/v1/dashboards/{uuid}`。按 `(凭证指纹, dashboardUuid)` 做 60s 进程内缓存；指纹算法直接复用 explore 缓存的 `createExploreCacheKey`（`createMcpServer.ts:22-34`，含 `apiKey` 与 `X-Lightdash-User-Attributes` 的 sha256），禁止跨 token 复用。注意 `fetchContexts` 现有 `cacheKey` **只含** `projectUuid|chartUuid|exploreName`（`dashboardContextResolver.ts:79-87`），不能照抄。

阻断路径（0 候选 / 预检失败）应**先绕过缓存重查一次**，避免客户刚配好看板仍被判 `dashboard_configuration_required`。反查结果缓存沿用现有 60s；配置变更后 ≤60s 生效需写进运维说明。

### 4.3 0 候选：用后端计数分流，不用角色猜

后端在 `ApiGetDashboardContextsResponse.results` 增加 `associatedCount: number`（= 权限过滤前的 `rows.length`）。这是权威事实、零额外请求、与身份无关。

| `associatedCount` | 含义 | 状态 |
|---|---|---|
| `0` | 该 explore / chart 在这个项目里没有挂任何看板 | `dashboard_configuration_required` |
| `> 0` 且 `contexts.length === 0` | 挂了看板，但当前账号一个都看不到（CASL / 空间 / client-use 白名单） | `dashboard_permission_required` |

只返回数量、不返回被隐藏看板的 uuid / 名称 / 链接，避免元数据泄露。

口径约束：

- `associatedCount` 恒等于**权限过滤前**的 `rows.length`，与 `includePrivate` 无关；严格模式沿用默认 `includePrivate=true`。
- MCP 的 `getDashboardContexts` 客户端目前把形状异常响应回退成 `{ contexts: [] }`（`src/rest/endpoints.ts:289-293`）。实施时必须**保留 `associatedCount === undefined` 的语义**（不要 `?? 0`），并把形状异常单独当错误抛，否则"后端没升级"会被误判成"没配看板"。
- 后端升级前的兼容策略见 §14.5（fail-closed）。

> 若产品上连"有几张你看不到的看板"也不允许暴露，退化为只返回 `hasAssociated: boolean`；两种情况的提示文案仍不同，但不再给出数字。不允许退回"按角色判断"。

### 4.4 显式 `dashboardUuid` 的归属校验（避免任意配对）

只看"能打开"不够：`/query/dashboard-chart` 只校验看板属于本项目且用户可打开（`AsyncQueryService.ts:2489-2519`），**不校验 chart 是否挂在该看板上**。因此调用方可以拿"能打开的看板 A"去查"挂在看板 B 上的图表 / explore"，若 `sql_filter` 有类目分支，就会用 A 的 slug 放宽可见行。

严格模式下因此追加一条：**显式 `dashboardUuid` 必须出现在该 `exploreName` / `chartUuid` 的反查候选集合里**（`/dashboards/context`，60s 缓存），否则返回 `dashboard_not_found` 并附候选链接。

代价与例外：

- 每次查询多一次（已缓存的）反查调用；
- 若某 explore 只被 SQL 图表 / data app 磁贴使用，反查为空 → 该 explore 在严格模式下不可查（外部部署可接受，属"未配置"）；
- 若运营上确实需要"跨看板复用同一 explore"，再评估放宽（届时必须同时确认 `sql_filter` 没有类目分支）。

### 4.5 已否决的方案

| 方案 | 否决理由 |
|------|----------|
| 用 `GET /api/v1/user?projectUuid=` 的 `clientUse.scopeApplied` 区分权限 / 配置 | 语义不匹配（该字段表示"用户是否被收窄"），且在非 client-use 项目、外部部署的 editor 上都会误判；还需要 60s 缓存与额外 RTT。**注意：本条目否决的是"用它做权限/配置判定"，不是"用它选文案口吻"——后者见 §9.7** |
| 按项目角色放行（editor+ 免看板） | 与"部署级开关"矛盾，且外部部署的 editor 同样可能看不到看板 |
| 只在 `sql_filter` 引用 `dashboardSlug` 时才强制 | 检测只看 base table 且只认 `dashboardSlug` 字符串（`fieldIdResolver.ts:11-31`），joined table 与未来改动都会漏；外部部署不能接受 |
| 0 候选时自动挑一个"最像的"看板 | 行级口径由看板决定，静默挑错等于给错数据；必须让调用方显式选 |
| 显式 `dashboardUuid` 不做归属校验（任意可打开的看板都能当上下文） | 会允许"看板 A + 图表 B"任意配对，放宽 `sql_filter` 的类目分支；见 §4.4 |

## 5. 部署口径

| 部署 | `MCP_DASHBOARD_STRICT` | 行为 |
|------|------------------------|------|
| 线上 · 外部品牌 CT | `true` | 查询必须解析出看板上下文；无看板 / 无权限均阻断并提示 |
| 预发 · 外部品牌 CT | `true` | 同上 |
| 线上 / 预发 · 内部 | `false` / 不设 | 保持现有行为（依赖 `dashboardSlug` 时才反查，多候选取排序第一个） |

强制模式是**部署级**开关，不是角色级开关。

## 6. 权限与"后台配置"职责边界

| 谁 | 负责什么 |
|----|----------|
| 客户后台（Admin RPC 白名单，`ADMIN_API_HOST` + `ADMIN_API_KEY`） | 决定某个手机号能看哪些看板；未配置时不收窄（只剩 CASL） |
| Lightdash 后台（项目角色 / 空间权限） | 决定能否 `view Dashboard`、能否进入看板所在空间 |
| dbt 项目（`sql_filter`） | 决定看板 slug 如何映射到行级过滤 |
| 后端 | 执行以上全部判断，返回 403 / 404 与 canonical `dashboardSlug` |
| MCP（本方案） | 只保证"查询一定带上下文"，并把 403/404 翻译成可读状态；**不做授权判断** |

因此外部客户上线前后的配置动作（不在本方案代码里）：

1. 数据集必须真的挂到看板（saved chart tile），否则反查 0 候选 → `dashboard_configuration_required`；
2. 看板必须在该客户的白名单里（或该账号是允许的受限角色之外的角色），否则 → `dashboard_permission_required`；
3. `sql_filter` 里要真正使用 `${lightdash.user.dashboardSlug}`，否则带不带看板结果一样（本方案不校验这一点）。

### 6.1 同一张表，两种身份的提示差异

严格模式本身**只有一套文案**（同状态同文案，不按身份分支）。身份差异来自闸门顺序：受限账号在"可查表预检"就被拦下，走不到看板闸。

```
① 认证 → ② 能力位 / 可查表预检 → ③ 必须解析 dashboardUuid → ④ 看板权限 → 查数
```

| 同一张"没挂看板"的表 | `editor` / `admin` | 受限 `viewer` / `interactive_viewer` |
|---|---|---|
| 实际返回 | `dashboard_configuration_required` | `已拒绕查询「xxx」：该表不存在或不在当前项目可访问表中` |
| 停在哪道闸 | 第②闸能过，卡在第③闸 | 第②闸直接拒（受限角色的可查表列表由白名单看板派生） |
| 客户可操作性 | 明确：去配看板 | 模糊：只能说"联系客服" |

结论：

- **这是正确行为，不需要改成"按身份给不同状态"**；泄露"项目里有这张表但没配看板"对客户是不必要的元数据泄露。
- **但文案要让两种读者都能动手**：配置类文案写成双路径（管理员去配看板 / 客户联系客服）；预检拒绝文案补一句"或尚未挂到任何看板"，避免客户报"表不存在"。
- **内部排障统一动作**：用**管理员 PAT** 跑 `/dashboards/context?exploreName=` 看 `associatedCount`。`0` = 配置问题；`> 0` 且客户看不到 = 白名单/空间问题。客户视角不需分清这两者。

## 7. 阻断路径与状态

| 情况 | 状态 | `action` | 给什么 | 是否执行查询 |
|------|------|----------|--------|--------------|
| 传了 `dashboardUuid`，但无权限（CASL / 空间 / 白名单） | `dashboard_permission_required` | `request_dashboard_access` | 看板链接 + `MCP_DASHBOARD_CONTACT` | 否 |
| 未传，反查 0 候选且 `associatedCount > 0` | `dashboard_permission_required` | `request_dashboard_access` | 权限提示 + `MCP_DASHBOARD_CONTACT`；无具体看板链接 | 否 |
| 未传，反查 0 候选且 `associatedCount === 0` | `dashboard_configuration_required` | `configure_dashboard` | "必须配置看板；无看板 ID 的数据集对外客户不能正常使用" | 否 |
| 传了 `dashboardUuid`，但该看板不是这个 explore / chart 的关联看板 | `associatedCount === 0` → `dashboard_configuration_required`；`associatedCount > 0` → `dashboard_not_found` | `configure_dashboard` / `verify_dashboard_uuid` | 前者：必须配置看板 + contact；后者：候选链接 + 提示换 uuid | 否 |

另有两种失败状态：`dashboard_not_found`（uuid 不存在 / 跨项目 / 未关联，`action: verify_dashboard_uuid`）与 `dashboard_context_unavailable`（预检网络/5xx、反查接口失败、`associatedCount` 缺失，`action: retry_later`）。

## 8. 工具覆盖范围（A 方案）

### 8.1 纳入强制模式

| 工具 | 接入方式 |
|------|----------|
| `run_metric_query` | 解析后传 `dashboardUuid` 给 `runMetricQueryUntilReady`；**不再用 `requiresDashboardContext` 做前置条件** |
| `run_semantic_metric_query` | 同上；`metricQuery` JSON 内嵌 `dashboardUuid` 与独立参数都走同一预检 |
| `run_saved_chart` | 有上下文时固定走 `/query/dashboard-chart`（`AsyncQueryService.ts:2487-2519` 服务端解析并注入）；**禁止**在严格模式下走 `/query/chart`（不接受 uuid，恒 `NA`）。注意：`/query/dashboard-chart` 不支持 `versionUuid`，严格模式下该参数被忽略，需在工具描述与返回里声明 |
| `search_field_values` | 解析 → field search 带 uuid；**禁用 SQL DISTINCT 回退**；空结果直接返回 `rows: []` + `source: 'field-values-v1-endpoint'`，**不再因空值回退**（避免 viewer 回退到 metric-query 必 403）；仅在接口缺失/404 时回退到**带 uuid 的 metric-query** |
| `run_dashboard_tiles` | `dashboardUuid` 本就必填；403 / 404 在跑任何磁贴前**整批阻断**（现状 403/404 在 `api.getDashboard` 处直接抛，逐磁贴 `status:'error'` 只在执行阶段出现，`registerExtensionTools.ts:457,521-533`） |

### 8.2 不变

- `list_charts`、`get_dashboard_tiles`、`get_dashboard_code`、`find_dashboards` 等只读元数据工具；
- 所有非查询工具；
- 开关关闭时的全部现有行为（含"多候选取排序第一个"）。

**agent 的看板发现路径**（不受开关影响，不查数）：`list_dashboards` / `find_dashboards` → `get_dashboard_tiles`，或直接使用上一次 `dashboard_selection_required` 返回的候选。工具描述里要写清这条路径，避免 agent 反复试错。

## 9. 返回契约

阻断类结果同时返回 `content`（格式化 JSON 文本）与 `structuredContent`，并设置 `isError: true`；多候选选择结果**不算错误**。每个阻断结果带 `action` 字段。

**"看板类"阻断覆盖三种主体**（同一套 `status`，用 `source` 字段标明来源）：

| 主体 | Lightdash 实体 | 入参 | 哪些工具会产生 |
|---|---|---|---|
| 数据集 / 表 | explore（dbt 模型里的 explore 名） | `exploreName`（flat 版即 `exploreName` / `table`） | `run_metric_query`、`run_semantic_metric_query`、`search_field_values` |
| 图表 | saved chart | `chartUuid` | `run_saved_chart` |
| 看板 | dashboard | `dashboardUuid`（必填） | `run_dashboard_tiles`、`get_dashboard_tiles`（后者只读） |

因此 `dashboard_configuration_required` 的 message 会随主体变化：数据集走「`「orders」还没有绑定任何看板`」，图表走「`该图表还没有绑定任何看板`」；`run_dashboard_tiles` 的 `dashboardUuid` 已必填，只会出现 `dashboard_permission_required` / `dashboard_not_found`，不会出现"配置"类。

### 9.1 有看板 ID 但无权限

```json
{
  "status": "dashboard_permission_required",
  "action": "request_dashboard_access",
  "message": "您没有这张看板的访问权限。",
  "dashboardUuid": "...",
  "dashboardUrl": "https://x.brandct.com/projects/.../dashboards/.../view",
  "contact": "请联系客服开通看板访问权限。",
  "hint": "下一步：请联系客服开通权限（可把看板链接发给客服）；开通后用同一个 dashboardUuid 重试。",
  "detail": "You don't have access to this dashboard"
}
```

### 9.2 反查 0 个可见看板，但存在关联看板（权限问题）

```json
{
  "status": "dashboard_permission_required",
  "action": "request_dashboard_access",
  "message": "该数据集关联了 3 张看板，但你的账号没有其中任何一张的权限。",
  "dashboardUuid": null,
  "dashboardUrl": null,
  "contact": "请联系客服开通看板访问权限。",
  "associatedCount": 3,
  "hint": "下一步：请联系客服开通权限；已开通仍看不到时，请管理员检查这些看板所在空间的访问权限。"
}
```

### 9.3 反查 0 个关联看板（配置问题）

```json
{
  "status": "dashboard_configuration_required",
  "action": "configure_dashboard",
  "message": "「orders」还没有绑定任何看板，需要先绑定看板才能查询。",
  "source": "exploreName | chartUuid",
  "exploreName": "orders",
  "chartUuid": null,
  "associatedCount": 0,
  "contact": "请联系客服开通看板访问权限。",
  "hint": "下一步（管理员）：把该数据集挂到一个看板上并确认空间 / 看板授权，约 60 秒内生效，然后带 dashboardUuid 重试。\n下一步（客户）：请联系客服确认这张表的开放计划。"
}
```

文案要求：

- 每条阻断文案固定两行结构：**第一行给用户**（结论 + 归属：权限 / 配置 / 临时故障），**第二行给 agent / 客服**（`下一步：` 具体动作）；
- 配置类 `hint` 按身份分两行（管理员 / 客户），并写明"约 60 秒内生效"，避免客服以为要发版；
- 面向调用方的文案**不提内部开关**（不出现"强制看板模式"、`MCP_DASHBOARD_STRICT`）：只说"还没有绑定任何看板，需要先绑定看板才能查询"；`note` 字段已移除；
- 不说"你的表不存在"，也不暴露具体看板名；
- `contact` 必须来自 `MCP_DASHBOARD_CONTACT`，不得硬编码。

### 9.4 反查到多个看板，需要选择（非错误）

```json
{
  "status": "dashboard_selection_required",
  "action": "select_dashboard",
  "message": "「orders」关联了多个看板，请选一个后重试。",
  "source": "exploreName | chartUuid",
  "candidateCount": 2,
  "candidates": [
    {
      "dashboardUuid": "...",
      "dashboardSlug": "...",
      "dashboardName": "...",
      "dashboardUrl": "..."
    }
  ],
  "hint": "下一步：把选中看板的 dashboardUuid 传回来。对外查询建议每次显式传 dashboardUuid 以固定行级口径。"
}
```

### 9.5 其他状态

- `dashboard_not_found` → `action: "verify_dashboard_uuid"`，带 `dashboardUrl`；用于 uuid 不存在或属于其他项目。文案：`没有找到这个看板，或它不属于当前项目。`
- `dashboard_context_unavailable` → `action: "retry_later"`；用于预检网络/5xx、反查接口失败、`associatedCount` 缺失。文案：`暂时无法确认看板信息，本次查询已停止（网络或服务临时故障）。`
- 显式 uuid 不属于该数据集关联看板时，按 `associatedCount` 分流（见 §7）：`0` → `dashboard_configuration_required`，`> 0` → `dashboard_not_found` + `candidates`。

### 9.7 预检层（可查表）的拒绝文案（按 `scopeApplied` 分流）

预检（闸②）的读者有两种，口径必须分开（2026-11 优化，覆盖原有的"不区分"写法）：

| 信号 | 取值 | 读者 | 口径 |
|---|---|---|---|
| `GET /api/v1/user?projectUuid=` → `results.clientUse.scopeApplied` | `true` | 受控角色（客户使用模式 + viewer / interactive_viewer） | 只说"没有这张数据表的权限 + 联系客服开通"，**不带"可能…"的推测**，不说"不存在"，不抛看板 / 白名单 / 用户属性等内部术语 |
| 同上 | `false` | 非受控角色（editor / admin，或非客户使用模式） | 区分"没权限（用户属性 / 看板未授权）"与"没这张表（不在项目 / 未索引 / 编译失败）"，给可执行排查步骤 |
| 同上 | `null` | 无法判断（后端未升级 / 未带 `projectUuid`） | 中性："当前账号看不到这张表" + "先核对表名"，**不得**断言"不是权限问题" |

`reason` 枚举与最终文案（`src/mcp/access/assertExploreQueryable.ts`）：

| reason | 触发 | 受控文案（首行 / 次行） | 非受控文案（首行 / 次行） |
|---|---|---|---|
| `not_visible` | 在 `/explores?filtered=true` 里、但不在 `dataCatalog` 里（**非受控角色**才会出现；受控角色的 `/explores` 已被白名单收窄） | `「x」当前不可查询：你的账号没有这张数据表的权限。` / `下一步：请联系客服开通权限；开通后从 get_my_access 的 explores.queryable 选表重试。` | `已拒绝查询「x」：当前账号看不到这张表（用户属性不满足，或该表未进目录 / 编译失败）。` / `下一步：检查该用户的 user attributes 后重试`（`MCP_DASHBOARD_STRICT=true` 时加"与该表所在看板的授权"） |
| `unknown_explore` | 两张名单里都没有。**受控角色的绝大多数拒绝走这里**（未被白名单覆盖的表在 `/explores` 阶段就被过滤掉了） | **与 `not_visible` 完全相同**（客户只需知道有没有权限，不需要区分"没绑看板 / 没授权 / 表名错"） | `已拒绝查询「x」：该项目没有这张表，或目录尚未索引。` / `下一步：确认 dbt 模型名与项目「表选择」设置，等目录索引完成后重试`（strict 时追加"尚未绑定看板的数据集也会出现在这里"） |
| `authorization_unavailable` | 白名单取不到授权数据，后端把 `/explores` 与 `dataCatalog` 一起清空：`rpc_error`、`no_email`（无邮箱分支）。**判定优先于 `not_visible` / `unknown_explore`** | `暂时无法确认「x」的权限，本次查询已停止。` / `下一步：请稍后重试；持续失败请联系客服。` | `暂时无法确认「x」的查询权限（授权服务不可用），本次查询已停止。` / `下一步：检查 ADMIN_API_HOST / ADMIN_API_KEY 与看板授权服务后重试。` |
| `no_run_metric_query` | 令牌没有 `view Explore`（viewer 角色） | `「x」暂时不能直接查询：查看者角色不支持临时查询。` / `下一步：请改用已保存的图表 / 看板查询；需要自由查询请联系客服。` | `已拒绝查询「x」：查看者角色不支持临时指标查询。` / `下一步：改用 run_saved_chart / run_dashboard_tiles；需要自由探索请让管理员把项目角色改为交互式查看者。` |

约束：

- 受控口径**不出现**"不存在 / 用户属性 / 看板 / 白名单 / 可能"，也不泄露看板名称、数量、链接；
- 非受控口径保留术语，因为读者是管理员 / 客服，需要据此定位 dbt 模型、用户属性或看板授权；
- 拒绝路径会**绕过缓存重查一次**（`loadClassifiedExplores({ forceFresh: true })`），保证"刚开通 / 刚修好"能立刻放行，因此 §9.3 的"约 60 秒内生效"成立。

`scopeApplied` 的来源与缓存：`getAuthenticatedUser` 带 `projectUuid`（`src/rest/endpoints.ts`），与 `/explores` / `dataCatalog` 同批拉取，一起进入 MCP 侧 5 分钟分类缓存（后端 allow-list 自缓存 30s）；后端未升级时该字段缺失 → `null` → 走中性口径。
`/api/v1/user?projectUuid=` 是既有接口（`userController.ts`），老后端会忽略该参数、不报错，因此本改动**不依赖后端同步上线**（只是拿不到更细的口径）。

> 与 §4.5 的关系：`scopeApplied` 在这里**只用于选择文案口吻**，不参与"权限 vs 配置"的判定（该判定仍由 `associatedCount` 负责），§4.5 的否决结论不变。

### 9.8 文案清单（发版 QA 可直接对照）

| 场景 | status | 最终 message | 最终下一步（hint / 次行） |
|---|---|---|---|
| 表没绑看板（非受控） | `dashboard_configuration_required` | `「x」还没有绑定任何看板，需要先绑定看板才能查询。` | 管理员：挂看板 + 授权，约 60 秒内生效，带 dashboardUuid 重试 / 客户：请联系客服开通权限 |
| 看板无权限（显式 uuid） | `dashboard_permission_required` | `您没有这张看板的访问权限。` | 请联系客服开通权限（可把看板链接发给客服）；开通后用同一个 dashboardUuid 重试 |
| 有关联看板但一张都看不到 | `dashboard_permission_required` | `该数据集关联了 N 张看板，但你的账号没有其中任何一张的权限。` | 请联系客服开通权限；已开通仍看不到时，请管理员检查看板所在空间的访问权限 |
| 多个候选未指定 | `dashboard_selection_required` | `「x」关联了多个看板，请选一个后重试。` | 把选中看板的 dashboardUuid 传回来；对外查询建议每次都显式传 |
| uuid 不存在 / 跨项目 / 不属该数据集 | `dashboard_not_found` | `没有找到这个看板，或它不属于当前项目。` | 从候选里选一个已绑定的看板，或先用 list_dashboards / find_dashboards 查找 |
| 看板信息取不到（含后端缺 `associatedCount`） | `dashboard_context_unavailable` | `暂时无法确认看板信息，本次查询已停止（网络或服务临时故障）。` | 稍后重试；持续失败请联系客服 |
| 受控角色查询被拒 | （预检拒绝） | `「x」当前不可查询：你的账号没有这张数据表的权限。` | 请联系客服开通权限；开通后从 explores.queryable 选表重试 |
| 受控角色撞上授权服务故障 | （预检拒绝） | `暂时无法确认「x」的权限，本次查询已停止。` | 稍后重试；持续失败请联系客服 |
| 查看者跑临时查询 | （预检拒绝） | `「x」暂时不能直接查询：查看者角色不支持临时查询。` | 改用已保存的图表 / 看板查询；需要自由查询请联系客服 |

### 9.6 防御性错误映射

查询执行阶段若后端仍返回 403，按文案映射（`ProjectService.ts:4677/4740`、`DashboardService.ts:891/903`、`AsyncQueryService.ts:2502`）：

| 后端文案包含 | 映射 |
|---|---|
| `contact your administrator to configure dashboard access permissions` | `dashboard_permission_required`（白名单） |
| `access to the space this dashboard belongs to` | `dashboard_permission_required`（空间） |
| `access to this dashboard` | `dashboard_permission_required`（client-use） |
| `Dashboard does not belong to project` / `row level security filter cannot be applied` | `dashboard_not_found`（口径不可信，按"看板不可用"处理） |
| 其他 403 / 4xx / 5xx | 保持现有 `formatFlatMetricQueryError` 等既有格式化逻辑 |

## 10. 实施映射

### 10.1 后端 / common（一次性、向后兼容）

| 位置 | 改动 |
|------|------|
| `packages/common/src/types/dashboard.ts:379-384` | `ApiGetDashboardContextsResponse.results` 增加 `associatedCount: number` |
| `packages/backend/src/services/DashboardService/DashboardService.ts:1173-1249` | 返回值改为 `{ contexts, associatedCount }`；`associatedCount = rows.length`（`:1186`，权限过滤前）；同时修正 `exploreName` 反查的 chart 版本口径（`DashboardModel.ts:750-761`） |
| `packages/backend/src/controllers/projectController.ts:723-733` | 响应体透传 `associatedCount` |
| `packages/backend/src/generated/{routes.ts,swagger.json}` | 跑 `pnpm generate-api`（`package.json:149`）重新生成 |
| 测试 | 新增 `DashboardService.getDashboardContexts` 的 0 候选 / 部分可见用例（当前无任何直接测试） |

### 10.2 MCP

| 位置 | 改动 |
|------|------|
| `src/config.ts:7-35,125-141` | 新增 `dashboardStrict: boolean`、`dashboardContact: string`；解析 `MCP_DASHBOARD_STRICT` / `MCP_DASHBOARD_CONTACT` |
| `src/http.ts:40-82,193-203` | 启动日志与 `/health` 输出 `dashboardStrict` |
| `src/rest/requestBase.ts:49-76` | 新增 `LightdashApiError extends Error { status: number; detail: string }`，message 格式保持不变；导出 `isDashboardAccessError` / `getDashboardErrorKind` |
| `src/rest/endpoints.ts:249-296` | `getDashboardContexts` 返回类型加 `associatedCount: number \| undefined`；保留 `undefined` 语义，形状异常单独抛错（不要把异常变 `{ contexts: [] }`） |
| `src/lib/contentWebUrls.ts` | 导出 `buildDashboardWebUrl({ publicBaseUrl, projectUuid, dashboardUuid })` |
| 新增 `src/lib/requiredDashboardContext.ts` | 严格模式唯一入口：显式预检（含项目归属）、反查、多候选、0 候选按 `associatedCount` 分流、状态→`CallToolResult` 构造、403 文案映射 |
| `src/lib/dashboardContextResolver.ts:182-214` | 显式 uuid 分支改为状态感知（抛 `LightdashApiError`，不再 `catch {}` 伪造成 `resolved`）；多候选在严格模式下返回 `needs_selection`；`DashboardCandidate` 增加可选 `dashboardUrl`；`buildDashboardSelectionRequiredResult:91-113` 拆出"0 候选"分支 |
| `src/lib/dashboardContextResolver.ts:33-48,63-66,146-165` | 结果类型与缓存改造：`status:'none'` 携带 `associatedCount: number \| null`；`CacheEntry` 同步缓存 `{ contexts, associatedCount }`；严格模式下 resolver 改为**单实例共享缓存**（现在 `registerQueryTools.ts:189`、`registerExtensionTools.ts:147` 各建一份） |
| `src/mcp/tools/registerQueryTools.ts` | `run_metric_query`（`:563-758`）/ `run_semantic_metric_query`（`:424-558`）改为"严格模式无条件解析"；`search_field_values`（`:191-405`）接入解析 + 禁 SQL 回退 + 空值不回退；工具描述按开关切换（现描述仍承诺 SQL DISTINCT 回退，`:196`） |
| `src/mcp/registerExtensionTools.ts` | `run_saved_chart`（`:234-371`）严格模式固定走 `runDashboardChart`（并声明忽略 `versionUuid`）；`run_dashboard_tiles`（`:449-553`）403/404 整批阻断；工具描述（`:238`）按开关切换 |
| `src/mcp/access/assertExploreQueryable.ts` | 预检文案按 `clientUse.scopeApplied` 分受控 / 非受控两套（§9.7）；`reason` 由 `attribute_denied` 拆为 `not_visible` / `unknown_explore` / `authorization_unavailable`；`unknown_explore` 的看板半句只在 `MCP_DASHBOARD_STRICT=true` 追加 |
| `src/rest/endpoints.ts` `getAuthenticatedUser` | 支持 `?projectUuid=`，拿到 `results.clientUse` 诊断（`scopeApplied` / `status` / `effectiveProjectRole`） |
| `src/mcp/tools/registerAccessTools.ts` | `get_my_access` 输出新增 `clientUse`（`scopeApplied` / `restrictedRole` / `status` / `effectiveProjectRole` / `reason`，不含看板名） |
| `src/mcp/tools/registerAccessTools.ts:127-198` | `get_my_access` 增加 `dashboardStrict` / `dashboardContact` |
| `src/mcp/mcpDocsContent.ts:34` | 说明严格模式、三条阻断路径、`dashboard_*` 状态枚举；修正现有"不要干等 `dashboard_selection_required`"与实际行为不符的表述 |
| 测试夹具 | `coreToolsContext.test.ts:11-31`、`mcpHttpLifecycle.test.ts:14-30`、`mcpSessionRegistry.test.ts:19-35` 三处手工 config 必须同步新增字段（`tsconfig.json:21` 排除测试文件，typecheck 不会报错）；`package.json:18` 的 test 列表按需补新文件 |
| 反查入参约束 | 严格模式必须保证 `exploreName` / `chartUuid` **至少一个非空**（两者都空时后端抛 `ParameterError`，`DashboardService.ts:1181-1183`） |
| 写任务顺序 | resolver + `requiredDashboardContext` 先落地（含单测），再接工具；避免两处各写一套阻断逻辑 |

### 10.3 文档同步（与代码同一 PR）

| 文件 | 更新内容 |
|------|----------|
| `packages/lightdash-mcp/README.md:64-79,117` | 环境变量表去掉"未实现"、`/health` 字段加 `dashboardStrict` |
| `docs/mcp/mcp-service-launch.md:213-237,337` | §5.4 条件②、§5.5 流程图、§8.2 验收行 6 要按 `MCP_DASHBOARD_STRICT` 拆两套期望（否则上线验收会按严格模式关闭的口径判失败） |
| `docs/mcp/mcp-dashboard-context.md:95-125` | 规则表加"以下为 `MCP_DASHBOARD_STRICT=false` 的行为" |
| `docs/mcp/mcp-tools-permissions.md` | 已加严格模式注记，实施后再补状态枚举 |
| `src/config.ts:4` 注释 | 注释指向 `packages/lightdash-mcp/.env.example`，但该文件在仓库里**不存在**；实施时补上或改注释 |

## 11. 验收场景

| 场景 | `MCP_DASHBOARD_STRICT` | 期望 |
|------|------------------------|------|
| 不带 `dashboardUuid` 查普通数据集 | `false` | 行为与现在一致，无新提示 |
| 不带 `dashboardUuid` 查**不依赖** `dashboardSlug` 的数据集 | `true` | **仍然阻断**（A 方案），按 0 候选或唯一候选处理 |
| 显式有效 `dashboardUuid` | `true` | 查询成功，`resolvedDashboardContext` 含 `dashboardUuid` + `dashboardUrl` |
| 显式无权限 `dashboardUuid` | `true` | `dashboard_permission_required`，含链接 / contact，无查询 |
| 显式其他项目的 `dashboardUuid` | `true` | `dashboard_not_found`，无查询 |
| 显式不存在的 `dashboardUuid` | `true` | `dashboard_not_found`，无查询 |
| 显式不属于该 explore / chart 的看板（能打开但没关联） | `true` | `dashboard_not_found` + 候选链接，无查询 |
| 显式有效看板，但传了 `run_saved_chart.versionUuid` | `true` | 查询成功，但 `versionUuid` 被忽略（结果里声明） |
| 未传、反查唯一 | `true` | 自动使用并提示显式传 UUID |
| 未传、反查多个 | `true` | `dashboard_selection_required` + 候选链接，无查询 |
| 未传、反查 0 个，`associatedCount > 0` | `true` | `dashboard_permission_required`，无查询 |
| 未传、反查 0 个，`associatedCount === 0` | `true` | `dashboard_configuration_required`，文案含"必须配置看板；无看板 ID 的数据集对外客户不能正常使用"，无查询 |
| `search_field_values` 同上场景 | `true` | 同样阻断 / 放行；空结果**直接**返回空列表，不回退裸 SQL，也不因空值回退 metric-query |
| `search_field_values` + viewer + 该字段确实无值 | `true` | 返回 `rows: []`，不报错（不会因回退 metric-query 而 403） |
| `run_saved_chart` 图表未挂看板 | `true` | `dashboard_configuration_required`（A 方案下不再"按普通 saved chart 查询"） |
| 同一张未挂看板的表，分别用 `editor` / 受限 `viewer` 调 | `true` | 前者 `dashboard_configuration_required`（双路径文案）；后者 `已拒绕查询…或尚未挂到任何看板` |
| 受限 `viewer` 调未挂看板的表 | `true` | 预检层拒绝（不暴露看板配置），文案含"或尚未挂到任何看板" |
| `run_saved_chart` chart 只存在于旧看板版本 | `true` | `dashboard_configuration_required`（计数只算最新 dashboard 版本里的 tile） |
| `run_dashboard_tiles` 无权限看板 | `true` | `dashboard_permission_required`，不跑任何磁贴 |
| backend 未升级（无 `associatedCount`） | `true` | `dashboard_context_unavailable`（fail-closed），**不得**落 `configuration_required` |
| 刚挂好看板（≤60s）后重试 | `true` | 阻断路径绕过缓存重查，立即生效 |
| `GET /health` | 任意 | 返回 `dashboardStrict` 布尔值 |
| `get_my_access` | 任意 | 返回 `dashboardStrict` / `dashboardContact` |

## 12. 残余风险（本期不解决，但必须知情）

### 12.1 PAT 可直连后端绕过强制模式

外部客户拿到的 PAT 就是完整 API 凭证（见 [外部接入指南](./lightdash-mcp-external-guide.md)），可以直接 `POST /api/v2/projects/:p/query/metric-query` 不带 `dashboardUuid`；后端此时**不报错**（`ProjectService.ts:4638-4640` → `NA`）。

因此本方案的定位必须写清：

- 在 MCP 层，它是**完整的护栏**（所有查询工具都能拦住）；
- 在“客户持 PAT 直连”这个场景，它只是**防误用护栏，不是安全边界**。

真正闭环需要后端加项目级开关（建议落点：`ProjectService.resolveDashboardContextForQuery`，项目设置 `require_dashboard_context=true` 时无 `dashboardUuid` 即 `ForbiddenError`）。本期**不实施**，单独立项；上线时向客户交付方说明“禁止把 PAT 交给未受控终端/脚本”。

### 12.2 其他不在威胁模型的通道

| 通道 | 说明 |
|------|------|
| `parameters` 覆写 | `run_metric_query` / `run_semantic_metric_query` 透传 `parameters`；若 `sql_filter` 引用了 `${lightdash.parameters.*}`，调用方可改行级口径。前提：`sql_filter` 只依赖 `lightdash.user.*`（需 dbt 侧确认） |
| `dashboardName` / `dashboardUuid` 引用 | 非严格部署的检测只识别 `dashboardSlug`（`fieldIdResolver.ts:11-19`），引用另外两个属性的模型不受保护 |

## 13. 发布与回滚

- 本文档阶段不产生运行时变更。
- 代码实施后：仅外部品牌 CT 部署设置 `MCP_DASHBOARD_STRICT=true`；内部保持关闭。
- 回滚只需把 `MCP_DASHBOARD_STRICT` 设为 `false`；`associatedCount` 是向后兼容的新增字段，backend / frontend 无需回滚。
- 版本按现有 `pnpm bump-mcp -- x.y.z` + `mcp-v*` tag 流程发布。
- 实施分支：`feat/mcp-dashboard-strict`，验收通过后再合 `dev`。

## 14. 假设与边界

1. 开关只在进程级生效，不在 session / 用户级生效。
2. MCP 不做授权判断；backend 的 CASL + 空间权限 + client-use 白名单是唯一授权来源。
3. `run_dashboard_tiles` 的 `dashboardUuid` 已必填，严格模式不改变入参形状，只改错误映射与阻断时机。
4. `search_field_values` 在严格模式下只允许"field search"（含空结果）与"接口缺失时带 uuid 的 metric-query 去重"两条路径；裸 SQL DISTINCT 一律禁用。
5. 反查 0 候选的分流依赖本方案新增的 `associatedCount`；未升级 backend 时该字段缺失，MCP 必须按 `dashboard_context_unavailable` 处理（fail-closed），不得回落为 `NA` 或 `configuration_required`。
6. `GET /api/v1/dashboards/{uuid}` 无项目校验且返回完整看板对象，MCP 必须比对 `projectUuid` 且不回显。
7. 不覆盖后端 hosted MCP（`McpService.ts` 内联 `runMiniMetricQuery:1216-1236` 与 `getSearchFieldValuesFunction:1238-1291` 都不传 dashboard context），如需覆盖另开任务。
8. 不覆盖 v1 `/api/v1/saved/{chartUuid}/chart-and-results`（该路径即便带 `dashboardUuid` 也不注入上下文，`ProjectService.ts:2447-2609`）；MCP 客户端已走 v2，不依赖它。
9. 不处理 dbt 权限模型自身的 fan-out 问题，也不校验 `sql_filter` 是否真的引用了 `dashboardSlug`。
10. 不新增 MCP 工具，不改变 `tools/list` 的工具集合；只扩展查询类工具的返回状态与 `get_my_access` 字段。
11. 非严格部署对引用 `dashboardName` / `dashboardUuid` 的 `sql_filter` 不设防（§12.2）；严格模式不区分引用哪个属性，统一要求上下文。

## 15. 实施记录（与设计的差异）

代码已落地，以下为实现相对 §4/§9/§10 的差异与补充事实（**以实现为准**）：

| # | 项 | 设计 | 实现 |
|---|----|------|------|
| 1 | 显式 uuid 的校验顺序 | 先预检 `GET /dashboards/{uuid}`，再校验关联 | **先反查关联候选**：命中候选直接放行（不发 `GET /dashboards/{uuid}`）；只有未命中且 `associatedCount > 0` 才调该接口区 403/404/未关联。原因：`getByIdOrSlug` 会写 `addDashboardViewEvent` 与 `dashboard.view` 埋点，正常查询不该刷浏览记录 |
| 2 | `dashboardContextResolver` 显式 uuid 分支 | 改为不吞错、校验项目归属 | **保留 dev 旧行为**（吞错后按 uuid 兜底）。严格模式不经过它，旧行为只影响非严格模式——这样开关关闭时零回归 |
| 3 | 预检缓存 | 按 (凭证指纹, dashboardUuid) 60s | 仅保留给第 1 项的兜底调用；正常路径完全不走缓存 |
| 4 | `search_field_values` 空结果 | 返回空列表 | 返回空列表 + `resolvedDashboardContext` 回显；另外区分「响应里没有值数组」（结构异常 → 报错，不静默当空值）与「空数组」 |
| 5 | `run_dashboard_tiles` | 403/404 整批阻断 | 预检阶段阻断；磁贴**执行阶段**出现看板类 403/404 也提升为整批 `dashboard_*` 结果（已在跑的磁贴无法取消） |
| 6 | 测试 | 见 §10 | `src/lib/requiredDashboardContext.test.ts`（19 例）+ `src/mcp/tools/strictDashboardGuard.test.ts`（8 例工具级：阻断不查数、非严格零回归、严格/非严格 search_field_values 分流）+ resolver/工具既有测试；`pnpm -F @lightdash/mcp test` 199 全绿 |

已知限制（未修，接受）：

- 工具报错映射依赖后端英文文案（`requestBase.getDashboardErrorKind`），后端改文案会退化为普通错误。
- `MCP_DASHBOARD_STRICT` 只识别小写 `true`。
- `run_dashboard_tiles` 未校验 `dashboard.projectUuid === projectUuid`（依赖 `dashboardUuid` 全局唯一 + 后端 `getByIdOrSlug` 的允许访问语义）。
- 后端 `findDashboardContexts` 的新 CTE 无真实库回归测试（`knex-mock-client` 在本机与 knex 2.6 不兼容），只有 SQL 离线编译校验。
