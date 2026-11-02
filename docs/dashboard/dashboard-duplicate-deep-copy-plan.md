# 看板复制彻底隔离图表资源（普通 saved chart + SQL chart 深克隆）

## 摘要

当前 `DashboardService.duplicate(...)` 存在多处“副本与原看板共享资源 / 引用错位”的问题：

1. 外层门禁 `hasChartsInDashboard(newDashboard)` 只认 `belongsToDashboard`，看板只含 space 图表时整段图表复制逻辑被跳过。
2. chart tile 复制时生成新 tile UUID，但 filters 的 `tileTargets`、`config.syncChartTileUuids` 未重映射 → 副本筛选器指向不存在的 tile。
3. SQL chart tile（`savedSqlUuid`）完全没有被复制 → 副本里的 SQL chart 与原看板共享同一份数据，改副本即改原看板。
4. tab UUID 重映射不完整：`lockedTabUuids`、`parentTabUuid`（`parentScope === 'tab'`）仍指向旧 tab。
5. 复制过程缺少源图表访问权限与项目边界校验。

目标：复制后的看板中，**每一个图表 tile（普通 saved chart 与 SQL chart）都指向一个全新的独立图表资源**，拥有新 UUID、新 slug、新版本行、新归属记录；所有 tile/tab 引用完整重映射；普通 saved chart 与 SQL chart 的数据模型保持隔离。

---

## 行为变更

### 1. 复制门禁改为“是否存在可复制图表 tile”
- 不再使用 `hasChartsInDashboard`（其语义是“存在 dashboard-owned 图表”）。
- 新增判定：dashboard 的 tiles 中存在任一 `isDashboardChartTileType(tile) && tile.properties.savedChartUuid`，或任一 SQL chart tile 且 `tile.properties.savedSqlUuid` 非空 → 进入图表复制分支。
- 该判定只作用于 `duplicate()` 内部，不修改 `packages/common/src/types/dashboard.ts` 中 `hasChartsInDashboard` 的既有语义（它仍被删除逻辑使用），避免影响“删除看板时清理孤儿图表”的既有行为。

### 2. 普通 saved chart tile：深克隆 + 重新绑定
对每个带 `savedChartUuid` 的 chart tile：
- 读取源图表，校验 `chart.projectUuid === projectUuid`（`SavedChartModel.get` 当前忽略 `projectUuid` option，必须由调用方显式校验）。
- 权限校验：源图表若为 dashboard-owned，校验其所属看板在目标项目内且用户有该看板的访问权；源图表若为 space-owned，使用 `spaceModel.getUserSpaceAccess` + CASL ability 判断用户对源图表所属 space 是否有 `view`（不依赖当前 permissive 的 `SpacePermissionService` stub；stub 仅可作为后续增强点）。
- 通过 `savedChartModel.create(...)` 创建副本：
  - 新 `saved_query_uuid` / `saved_query_id`，新且唯一的 slug（`generateUniqueSlug` 语义）。
  - `dashboardUuid = 新看板 uuid`，`spaceUuid = null`（归属新看板，脱离源 space）。
  - 复制完整版本语义：`metricQuery`（limit / dimensions / metrics / sorts / filters / tableCalculations / additionalMetrics / customDimensions / timezone / pivotConfig / parameters）、`chartConfig`、`tableConfig`、以及 `merge` 配置。
  - 由 `savedChartModel.create` 内部新建版本行与全部从属行（fields / sorts / tableCalculations / customDimensions / merges 等），源图表版本行不被修改。
- 新 tile：
  - 新 tile UUID（与原 tile 不同），写入 `properties.savedChartUuid = 新图表 UUID`。
  - `properties.belongsToDashboard = true`（新图表归属新看板）。
  - 其余 tile properties（title、hideTitle、chartName 等）保持原值；`chartName` 若存在则更新为副本图表名称，`chartSlug` 更新为副本 slug。

### 3. SQL chart tile：独立深克隆（新建 SQL chart）
- 扩展 SQL chart 创建链路以支持 dashboard-owned：
  - `packages/common/src/types/sqlRunner.ts`：`CreateSqlChart` 增加 `dashboardUuid?: string`，并明确 `spaceUuid` 与 `dashboardUuid` **互斥**（两者同时提供或均未提供时，服务层抛 `ParameterError`）；保留现有 space-owned 行为与字段不变。
  - `packages/backend/src/models/SavedSqlModel.ts`：`create(...)` 支持互斥归属——dashboard-owned 时写 `dashboard_uuid = data.dashboardUuid`、`space_uuid = null`；space-owned 时保持现状（`space_uuid = data.spaceUuid`、`dashboard_uuid = null`）。复用既有 `generateUniqueSlug` 逻辑生成唯一 slug。
  - `packages/backend/src/services/SavedSqlService/SavedSqlService.ts`：`createSqlChart(...)` 接受归属校验（互斥校验 + 目标 space/dashboard 的项目一致性校验）；`hasAccess(...)` 增加 dashboard-owned 分支——SQL chart 归属 dashboard 时，按该 dashboard 所属 space 解析访问权限，而不是无条件要求 `spaceUuid`。
  - `packages/backend/src/controllers/sqlRunnerController.ts`：body 类型跟随 `CreateSqlChart` 更新（字段为可选，新增行为向后兼容）；同步更新 TSOA/Swagger 产物。
- 复制流程：对每个带 `savedSqlUuid` 的 SQL chart tile：
  - 读取源 SQL chart，校验其项目与目标项目一致、用户对其有 `view` 权限（沿用 `SavedSqlService` 的权限上下文：space-owned 看 space，dashboard-owned 看其 dashboard 所属 space）。
  - 新建 SQL chart 副本：新 `saved_sql_uuid`、新唯一 slug、新 `saved_sql_versions` 行（复制 sql / limit / config / chart kind），归属新看板（`dashboard_uuid = 新看板 uuid`，`space_uuid = null`）。
  - 新 tile 指向新的 `savedSqlUuid`，并更新 `properties.chartName` / `chartSlug`。
  - SQL chart 复制使用 `SavedSqlModel` / `SavedSqlService` 专用链路，绝不混入普通 saved chart 分支。

### 4. Tile UUID 全量重映射
- 维护 `tileUuidMap: Record<旧 tileUuid, 新 tileUuid>`，覆盖所有被替换的 chart tile 与 SQL chart tile；未复制的 tile（markdown / loom / data app）UUID 保持不变并按 identity 映射。
- 复用同一映射重写：
  - dashboard 级 filters：`dimensions` / `metrics` / `tableCalculations` 各自的 `tileTargets`（键为 tile UUID）。
  - 每个 tab 内的 filters（`DashboardTab.filters`）的 `tileTargets`。
  - `config.syncChartTileUuids`（数组元素为 tile UUID）→ 映射为新 tile UUID。
- 结果必须落在新看板的 tile UUID 集合内：`DashboardModel.createVersion` 会对 filters 的 `tileTargets` 执行 `pick(..., tileUuids)`，映射错误会静默丢目标。

### 5. Tab UUID 全量重映射
- 维护 `tabUuidMap: Record<旧 tabUuid, 新 tabUuid>`，在新 tab 构造时同步写入。
- 复用同一映射重写：
  - `DashboardFilterRule.lockedTabUuids`（dashboard 级与 tab 级 filters 都要处理）。
  - `DashboardFilterRule.parentTabUuid`：仅当 `parentScope === 'tab'` 时映射；`parentScope === 'global'` 时保持 `undefined`/原值不变。
  - `DashboardFilterRule.parentFieldId` 保持不变（字段级引用，与 tab/资源 UUID 无关）。

### 6. 权限与边界校验（复制入口）
- 目标 space 必须属于请求的 `projectUuid`，否则 `ForbiddenError('Target space does not belong to this project')`。
- 源图表的 `projectUuid` 必须等于请求 `projectUuid`，否则拒绝复制。
- 源图表访问权限不足时拒绝复制（不静默跳过），保证副本内容不越权外泄。
- 保留既有 embed 写空间限制语义（若当前分支存在 `embedWriteSpaceUuids`，源 dashboard 必须在允许列表内）。

### 7. 依赖注入扩展
- `DashboardServiceArguments` / 构造函数新增 `savedSqlModel` 与 `savedSqlService`。
- 在 `packages/backend/src/services/ServiceRepository.ts` 中装配（该文件已持有 `savedSqlService` 与 `this.models.getSavedSqlModel()`，无需新增基础设施）。
- 同步更新 `packages/backend/src/services/DashboardService/DashboardService.mock.ts`。

---

## 类型与公开 API 变更

| 位置 | 变更 |
|---|---|
| `packages/common/src/types/sqlRunner.ts` | `CreateSqlChart` 增加 `dashboardUuid?: string`；语义为 `spaceUuid` 与 `dashboardUuid` 互斥；`spaceUuid` 由“必填”调整为“与 dashboardUuid 二选一”。 |
| `packages/backend/src/models/SavedSqlModel.ts` | `create(...)` 入参支持 dashboard-owned（写 `dashboard_uuid`、`space_uuid = null`）。 |
| `packages/backend/src/services/SavedSqlService/SavedSqlService.ts` | `createSqlChart(...)` 归属互斥校验 + 项目一致性校验；`hasAccess(...)` 支持 dashboard-owned 分支。 |
| `packages/backend/src/controllers/sqlRunnerController.ts` | body 类型更新（随 `CreateSqlChart`），需重新生成 OpenAPI（`pnpm generate-api`）。 |
| `packages/backend/src/services/DashboardService/DashboardService.ts` | `duplicate(...)` 行为变更；新增 `savedSqlModel` / `savedSqlService` 依赖。 |
| `packages/common/src/types/dashboard.ts` | `hasChartsInDashboard` 语义不变；复制门禁在服务内独立实现，避免影响删除流程。 |

破坏性变更控制：SQL chart 创建 API 仅新增可选字段，既有 space-owned 调用完全兼容；仅当同时传 `spaceUuid` 与 `dashboardUuid`（或都不传）时返回 400。

---

## 测试与验证

### 后端单元测试（`packages/backend/src/services/DashboardService/DashboardService.test.ts`）
1. 仅含 dashboard-owned 图表的看板 → 复制后图表是新 UUID、新 slug、`dashboardUuid` 指向新看板、`spaceUuid` 为 null。
2. 仅含 space-owned 图表的看板 → 同样产生独立副本（修复“门禁跳过”问题）。
3. 同时含 dashboard-owned 与 space-owned 图表 → 两者都生成独立副本。
4. 复制后修改副本图表（创建新版本 / 更新），原看板图表 UUID、slug、版本行保持不变。
5. 新 tile UUID 与原 tile 不同，且 `properties.savedChartUuid` 指向新图表、`belongsToDashboard === true`。
6. dashboard 级 filters 的 `tileTargets` 已映射到新 tile UUID。
7. tab 级 filters 的 `tileTargets` 已映射到新 tile UUID。
8. `config.syncChartTileUuids` 已映射到新 tile UUID。
9. `lockedTabUuids` 已映射到新 tab UUID。
10. `parentScope === 'tab'` 的 `parentTabUuid` 已映射；`parentScope === 'global'` 的父级保持不变。
11. 源图表无 `view` 权限时拒绝复制（抛错）。
12. 源图表 `projectUuid` 与目标项目不一致时拒绝复制。
13. `merge` 配置在副本图表及其版本行中完整保留，且与源图表版本行相互独立。
14. SQL chart tile：生成新 `savedSqlUuid`、新 slug、新版本行、`dashboard_uuid` 指向新看板、`space_uuid` 为 null。
15. 修改副本 SQL chart 不影响源 SQL chart（源版本行不变）。
16. 无图表 tile 的看板复制后不产生多余图表记录。

### 后端 SQL chart 单元测试（`packages/backend/src/services/SavedSqlService/` 或对应 model 测试）
- space-owned 创建保持现有行为（回归保护）。
- dashboard-owned 创建写入 `dashboard_uuid` 且 `space_uuid = null`。
- dashboard-owned 权限校验：能按 dashboard 所属 space 解析访问权。
- 同时传 `spaceUuid` 与 `dashboardUuid` 被拒绝；两者都不传被拒绝。
- SQL chart 深复制生成独立版本并正确重新绑定 tile。

### 验证命令
```bash
pnpm -F backend typecheck
pnpm -F backend lint
cd packages/backend && npx vitest run src/services/DashboardService src/services/SavedSqlService
cd packages/frontend && npx vitest run src/utils/categoryFiltersCrossScope.test.ts src/components/DashboardFilter/common/parentFilterRef.test.ts
pnpm generate-api
```
（若 ESLint 因内存不足失败，使用 `NODE_OPTIONS=--max-old-space-size=4096`。）

---

## 假设与默认选择

- **“始终克隆”语义**：沿用当前分支提交 `f76164365` 的既有意图——复制看板时，所有带 `savedChartUuid` 的 chart tile 一律生成独立副本（包括原本 space-owned 的图表），副本归属新看板（`space_id = null`）。这保证“改副本不影响原看板”在所有图表类型上一致成立。
- **筛选器规则 `id` 沿用**：过滤器规则的 `id` 是稳定业务标识，跨看板复制后沿用原值；承载值/targeting 的 `tileTargets` 被重映射。
- **非图表 tile UUID 沿用**：markdown / loom / data app tile 的 UUID 不变（不涉及可编辑共享资源），其 `tileTargets` 映射按 identity 处理。
- **slug 唯一性**：副本图表与副本 SQL chart 均生成唯一 slug，不沿用源 slug（避免与源图表冲突，也避免下游按 slug 索引时指向原资源）。
- **SQL chart 归属**：副本 SQL chart 采用 dashboard-owned（与副本普通 saved chart 一致），因此不会出现在 space 内容列表中。
- **权限实现**：使用当前分支可用的 `spaceModel.getUserSpaceAccess` + CASL ability，不把 `SpacePermissionService` stub（`resolveAccess` 返回空、`userCan` 恒为 true）当作真实安全边界；`SavedChartModel.get` 忽略 `projectUuid` 的问题由调用方显式补验解决。
- **不新增数据库迁移**：SQL chart 的 `dashboard_uuid` 可空外键与 `InsertSqlInDashboard` 联合类型在既有迁移中已存在，仅补齐应用层契约；实现时若发现约束冲突再单独立迁移。
- **本次不改前端复制入口**：前端 `DashboardDuplicateModal` / `DashboardHeader` 无需变更；后端返回的新 tile 与新图表 UUID 即为前端所见。
