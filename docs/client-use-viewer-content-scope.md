# client-use 受限角色（viewer / interactive_viewer）内容可见性设计

> 状态：**已实施**（commit `fe7c504ef`，分支 `fix/bugs`）。
> 本文档记录设计方案与落地口径，供后续维护与验收参考。

> 关联问题：客户「品牌 CT」项目，手机号 `18522948433` 的账号（组织角色=成员，项目角色=interactive_viewer）
> 通过 MCP 能看到 89 个空间 / 约 488 张已保存图表，而看板只看到 1 个。
> workbuddy 据此判定"该账号是管理员"，与实际角色不符。

---

## 0. 结论（一句话）

**不改数据（不去把公开空间改成私有），改读取侧：以 client-use 看板白名单为唯一可见性来源，
反推出「可见看板 / 可见图表 / 可见空间 / 可查数据集」四元集合（ViewerContentScope），
在内容列表、图表元数据、跑数三条路径上统一按该 scope 过滤（fail-closed）。**

- 公开空间保持公开（对项目内 editor+/admin 的可见性不变，符合"公开空间"语义）；
- client-use 受限角色的可见范围由客户的 RPC 白名单决定，与看板白名单口径一致；
- 图表跑数也纳入过滤，堵住"看板看不到但图表能跑出数据"的洞。

---

## 1. 问题现状（代码证据）

client-use 模式（`projects.is_client_use = true`）目前**只对看板和 ad-hoc 查询做了白名单过滤**，
空间与已存图表**完全绕过**：

| 入口                             | 当前过滤                             | 是否受白名单约束 | 代码位置                                               |
| -------------------------------- | ------------------------------------ | ---------------- | ------------------------------------------------------ |
| 看板列表                         | RPC 白名单（按手机号）               | ✅               | `DashboardService.ts:243`、`ContentService.ts:122-176` |
| 数据集/表元数据（catalog）       | 白名单派生 explore 名单              | ✅               | `CatalogService.ts:378 / 680 / 730`                    |
| ad-hoc 指标查询                  | `assertExploreAllowedForAdhocQuery`  | ✅               | `ProjectService.ts:4490`                               |
| **空间列表**                     | 仅空间权限（public 或 space access） | ❌               | `ContentService.ts:112`、`SpaceService.ts:660`         |
| **已存图表列表**                 | 同上（按图表所属空间）               | ❌               | 同上                                                   |
| **图表元数据 `get_saved_chart`** | 同上                                 | ❌               | `SavedChartService.ts:794`                             |
| **图表跑数 `run_saved_chart`**   | 仅空间权限 + `view Project`          | ❌               | `AsyncQueryService.ts:2190`                            |
| **看板磁贴跑数**                 | 仅空间权限                           | ❌               | `AsyncQueryService.ts:2374`                            |

根因：空间/图表的判据是 `hasViewAccessToSpace`，而 viewer 的能力规则里
`can('view','SavedChart',{ projectUuid, isPrivate:false })`（`projectMemberAbility.ts:24`）
对**项目内所有公开空间**生效，与 client-use 白名单无关。

影响分两级：

- **元数据泄露**：空间名/图表名/图表结构/字段名/webUrl 可见；
- **数据泄露（更严重）**：`run_saved_chart` 只校验空间权限，**不校验 explore 白名单**，
  与"同一用户 `run_metric_query` 只能查 7 张表"的口径自相矛盾。

---

## 2. 目标与不变量

**目标**

1. client-use 项目下受限角色可见的看板/图表/空间/数据集，与 RPC 白名单口径一致；
2. 不可见 = **不可跑数**（fail-closed）；
3. 非 client-use 项目、非受限角色（editor/developer/admin）行为**完全不变**。

**不变量**

1. `is_private` 语义不变：公开空间 = "项目内成员可见"，与"谁能看某个客户的数据"解耦；
2. 管理员/编辑/开发者不受影响；
3. RPC 故障时行为与现有看板一致（fail-closed：全不可见，而不是全放行）。

---

## 3. 方案选型

| 方案                                | 做法                                                               | 优点                                                                                                                            | 缺点                                                                                                                                   | 结论                                                           |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **A. 空间私有化（数据治理）**       | 把 89 个空间改成 `is_private = true` + 配 `space_user_access`      | 改动最小，立刻生效                                                                                                              | ① 需批量改生产数据、影响"公开空间"语义与管理员浏览；② 客户侧新增空间仍会漏（人工易错）；③ 图表虽然被挡住，但"空间"粒度仍粗；④ 回滚麻烦 | ❌ 不作为主方案，仅作可选治理项                                |
| **B. 看板反推 scope（读取侧过滤）** | 以白名单看板为唯一入口，反推可见图表/空间/数据集，三条路径统一过滤 | ① 与客户同步系统（RPC）口径一致；② 新增内容自动继承，无需人工维护空间可见性；③ 不动生产数据，可灰度、可回滚；④ 顺带堵住跑数漏洞 | 需要新增 1~2 个聚合查询 + 缓存                                                                                                         | ✅ **推荐**                                                    |
| **C. RPC 扩展到图表/空间维度**      | 让客户同步系统直接返回可见图表/空间清单                            | 语义最清晰，可支持"整空间授权"                                                                                                  | 依赖客户系统改造，周期长                                                                                                               | 🕐 备选（B 可平滑升级到 C：scope 来源换成 RPC 返回的清单即可） |

---

## 4. 公开空间怎么处理（重点问题）

### 4.1 结论

**可以，而且应该通过"看板反推"在读取侧把公开空间过滤掉；不需要动 `is_private`。**

原因：公开空间（`is_private = false`）在 Lightdash 里表达的是
"**项目内成员（含 editor+/admin）都能看到**"，而不是"**每个客户都能看到**"。
客户隔离是 client-use 的诉求，它天然应该由 client-use 专属的白名单机制来承担，
而不是去改空间属性（那会误伤项目内协作语义）。

### 4.2 过滤规则（受限角色 = viewer / interactive_viewer）

在既有空间权限之上**再取一次交集**：

```
可见空间 = 空间权限可见 ∩ scope.spaceUuids
可见图表 = 空间权限可见 ∩ scope.chartUuids
可见看板 = 空间权限可见 ∩ scope.dashboardUuids      （现状已有）
可查数据集 = scope.exploreNames                     （现状已有，ad-hoc 保留）
```

`scope.spaceUuids` 的定义（**看板驱动**口径）：

> 仅包含**持有白名单看板**的空间（根空间归一）。
> 磁贴图表所在的空间**不**因为“装了白名单看板的图表”而变得可见——
> 空间内一个白名单看板都没有时，这个空间整个移除（连空间名都不泄露）。

效果举例（品牌 CT，RPC 只授权 1 个看板「新品月报」）：

- 该看板所在空间 → 可见；
- 该空间内**其他看板** → 不可见；
- 该看板磁贴引用的 7 张表对应的图表 → 可见、可跑数（即使图表存放在别的空间）；
- 该看板磁贴引用图表所在但**不含白名单看板**的空间 → 空间不可见（图表仍可见）；
- 其余 88 个空间、其余约 480 张图表 → **不可见、不可跑数**；
- 空间列表里，那些"没有任何白名单看板"的公开空间 → **不出现**（连空间名都不泄露）。

### 4.3 什么时候仍然建议做空间私有化

即使代码侧已按 scope 过滤，仍建议客户做一次空间可见性治理（**运维建议，非代码前置条件**）：

1. 品牌方内部不同角色之间的隔离，公开空间会让任何项目成员看到全部内容；
2. 私有空间还能额外保护"看板磁贴之外"的散落图表（即便 scope 过滤已挡住，私有空间是第二道防线）；
3. 便于将来关闭 client-use 白名单时仍有基本隔离。

建议做法：把与客户交付无关的空间设为私有 + 配 `space_user_access`（含组授权），并保留
"客户授权看板所在空间"为公开（便于客户侧协作）。

---

## 5. 详细设计

### 5.1 新增类型

```ts
// packages/common/src/types/clientUseScope.ts
export type ViewerContentScope = {
  dashboardUuids: string[]; // RPC 白名单看板
  chartUuids: string[]; // 白名单看板磁贴引用的图表（saved_query_uuid + saved_sql_uuid）
  spaceUuids: string[]; // 可见空间：持有白名单看板的空间（已归一到根空间）
  exploreNames: string[]; // 白名单看板用到的 explore（ad-hoc 查询口径）
};
```

语义约定：

- `undefined` = 本次请求**不适用 scope 过滤**（非 client-use 项目 / 角色不受限）→ 保持现状；
- 数组（可为空）= **生效**且为空 → 什么都看不到（fail-closed）。

### 5.2 后端计算 scope

在 `DashboardService` 新增（紧邻 `getAllowedDashboardUuidsForViewer`，`DashboardService.ts:243`）：

```ts
async getViewerContentScope(
    user: DashboardAllowListUser,
    projectUuid: string,
): Promise<ViewerContentScope | undefined>
```

步骤（已实现）：

1. `dashboardUuids = await this.getAllowedDashboardUuidsForViewer(user, projectUuid)`；
   `undefined` → 直接返回 `undefined`；空集 → 返回全空 scope（fail-closed）。
2. `exploreNames = await dashboardModel.getExploreNamesByDashboardUuids([...dashboardUuids])`（已有）。
3. `chartUuids`：`DashboardModel.getChartUuidsByDashboardUuids(dashboardUuids)`（新增）——
   取白名单看板**最新版本**的磁贴图表，dbt 图表（`dashboard_tile_charts` → `saved_queries.saved_query_uuid`）
   与 SQL 图表（`dashboard_tile_sql_charts.saved_sql_uuid`）合集。
4. `spaceUuids`：`DashboardModel.getSpaceUuidsByDashboardUuids(dashboardUuids)`（新增）——
   白名单看板所属空间 ∪ 其磁贴图表所属空间，再用 `SpaceModel.getSpaceRoots()`（新增，批量）
   **归一到根空间**。

> 归一化理由：嵌套空间的 access/is_private 都继承根空间，过滤时必须用同一口径，
> 否则会出现"根空间被过滤 → 子空间内容查不到"。

### 5.3 接入点

| #   | 文件                                                                                  | 改法                                                                                                                                                      | 状态                                                                 |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `packages/backend/src/services/DashboardService/DashboardService.ts`                  | 新增 `getViewerContentScope()`                                                                                                                            | ✅                                                                   |
| 2   | `packages/backend/src/services/ContentService/ContentService.ts`                      | 空间与 scope 取交集；已保存图表按 `scope.chartUuids` 过滤；`dashboardCount`/`chartCount` 按可见内容重算（`SpaceModel.getVisibleChartCountsBySpaceUuids`） | ✅                                                                   |
| 3   | `packages/backend/src/models/DashboardModel/DashboardModel.ts`                        | 新增 `getChartUuidsByDashboardUuids` / `getSpaceUuidsByDashboardUuids`                                                                                    | ✅                                                                   |
| 4   | `packages/backend/src/models/SpaceModel.ts`                                           | 新增 `getSpaceRoots`（批量根空间）/ `getVisibleChartCountsBySpaceUuids`                                                                                   | ✅                                                                   |
| 5   | `packages/backend/src/services/SavedChartsService/SavedChartService.ts`               | `checkPermissions` 校验 `chartUuid ∈ scope.chartUuids`                                                                                                    | ✅                                                                   |
| 6   | `packages/backend/src/services/SavedSqlService/SavedSqlService.ts`                    | `hasAccess` 同上（SQL 图表）                                                                                                                              | ✅                                                                   |
| 7   | `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`                | `executeAsyncSavedChartQuery` / `checkDashboardChartQueryPermissions` 校验图表；`executeAsyncDashboardChartQuery` 校验看板                                | ✅                                                                   |
| 8   | `packages/backend/src/ee/services/McpService/McpService.ts`、`.../AiAgentService.ts`  | dashboard / chart finder 按 scope 过滤，分页总数按过滤后结果计算                                                                                          | ✅                                                                   |
| 9   | `packages/backend/src/services/ServiceRepository.ts`                                  | 向 `SavedChartService` / `SavedSqlService` 注入**惰性** scope resolver，避免 `DashboardService ↔ SavedChartService` 循环依赖                              | ✅                                                                   |
| 10  | `packages/backend/src/services/SpaceService/SpaceService.ts`（`filterBySpaceAccess`） | 增加 scope 参数                                                                                                                                           | ⛔ 未做：改为在上游（ContentService / MCP / AI Agent 的 finder）过滤 |

### 5.4 MCP 侧——避免 agent 再次误判

问题根因：`src/mcp/access/abilityFromRules.ts` 的能力位只看"**有没有**对应规则"，
不看 conditions，于是 `can('view','SavedChart',{isPrivate:false})` 被当成"能看所有图表"，
agent 由此推断出"管理员"。

**已实施（后端侧）**：内置 MCP（`packages/backend/src/ee/services/McpService/McpService.ts`）
与 AI Agent（`packages/backend/src/ee/services/AiAgentService.ts`）的 dashboard / chart finder
已按 scope 过滤，即使 MCP 侧能力位判断偏粗，后端也不会真的把白名单外内容吐出去。

**未实施（待后续）**：

1. **后端提供真实范围**：新增 `GET /api/v1/projects/:projectUuid/my-content-scope`
   （返回 scope 的计数与摘要：可见看板/图表/空间/表数量，以及 `scopeApplied` 标记）。
2. **MCP `get_my_access` 消费它**：`packages/lightdash-mcp/src/mcp/tools/registerAccessTools.ts`
   的 `buildProjectAccess` 增加 `contentScope` 字段；在描述里明确
   "能力位仅表示角色上限，实际可见范围以 contentScope 为准"。
3. **能力位加限定**：把 `runSavedChart` 的描述从"可跑已存图表"改为
   "可跑**该用户可见范围内**的已存图表（client-use 项目受看板白名单限制）"。

### 5.5 降级与 fail-closed

- RPC 调用异常时，现有实现返回**空 Set** → scope 返回空集，
  绝不会因为 RPC 挂了而"看不到看板却能看图表"（fail-closed）；
- RPC 未配置（`isConfigured()` 为 false）时现状是**跳过过滤**（`getAllowedDashboardUuidsForViewer`
  返回 `undefined`），**本次未改动**。
  ⚠️ 这是已知缺口：client-use 项目若未配置 RPC，受限角色仍会看到公开空间全部内容。
  建议后续改为 fail-closed，需先与客户确认 RPC 的可用性保障与影响面。

### 5.6 性能与缓存

- scope 计算 = 1 次 RPC + 3 个聚合查询（dashboard→chart、dashboard→space、space→root）。
- 看板白名单（RPC）与 scope 都加了**短 TTL + Promise 级缓存**（缓存的是 Promise，
  并发请求会合并成一次 RPC）：
  | 缓存 | Key | TTL | 说明 |
  | ---- | ---- | --- | ---- |
  | `allowListCache` | `projectUuid:userUuid` | 成功 30s / RPC 失败 5s | 失败结果只短暂缓存，RPC 恢复后尽快重试 |
  | `viewerScopeCache` | `projectUuid:userUuid` | 30s | scope 由白名单派生，两者 TTL 对齐 |
- 缓存条目上限 1000，超出后按插入顺序淘汰最旧条目；
  `DashboardService.clearViewerContentCache(projectUuid?)` 可主动失效。
- 效果：打开一个看板（10 个磁贴）时，RPC 调用从 ~22 次降到 1~2 次。

### 5.7 内容过滤的落点（重要）

`ContentService.find` 的 `spaceUuids` 过滤被空间、看板、图表三种查询**共用**，
因此客户使用模式的 scope **不能**通过收窄这个列表来生效——否则会连带把
白名单内的看板（及其磁贴图表）一起过滤掉（“有权限的看板不展示”）。

正确落点是**内容条目层（内存过滤）**：

| 内容类型 | 过滤条件                                                                    |
| -------- | --------------------------------------------------------------------------- |
| 空间     | 空间权限 ∩ scope.spaceUuids（按**根空间**比较；只保留持有白名单看板的空间） |
| 看板     | RPC 白名单（`allowedDashboardUuidsMap`，与空间 scope 无关）                 |
| 图表     | scope.chartUuids（白名单看板的磁贴图表）                                    |

空间过滤同时覆盖两种列表形态：根空间列表（`nlevel(path)=1`）与浏览空间的子空间列表
（`parent_space_uuid IN (...)`），后者此前会绕过空间 scope。

---

## 6. 实施状态

| 阶段           | 内容                                               | 状态                                                         |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| **P0**         | scope 计算 + 跑数 fail-closed（接入点 1、5、6、7） | ✅ 已实施                                                    |
| **P1**         | 图表/空间元数据过滤（2、3、4）                     | ✅ 已实施                                                    |
| **P2**         | MCP / AI Agent 内容查找按 scope 过滤（后端侧）     | ✅ 已实施（后端）；⛔ `lightdash-mcp` 侧 `contentScope` 未做 |
| **P3（可选）** | 客户侧空间私有化治理（4.3）                        | ⛔ 运维建议，非代码前置条件                                  |

---

## 7. 验收标准

**P0**

- ✅ 受限角色执行白名单外图表 → `ForbiddenError`（`SavedChartService` / `SavedSqlService` /
  `AsyncQueryService` 三处校验）；
- ✅ 受限角色执行白名单内图表 → 正常返回数据；
- ✅ 看板磁贴跑数对白名单外看板 → `ForbiddenError`；
- ✅ editor/admin 跑数不受影响（scope 仅在受限角色生效）；
- ✅ 非 client-use 项目行为零变化（`getAllowedDashboardUuidsForViewer` 返回 `undefined` 时不过滤）。

**P1**

- ✅ `find_spaces` / `find_charts` / v2 content API 只返回 scope 内内容；
- ✅ 空间 `chartCount`/`dashboardCount` 与实际可见内容一致（不泄露隐藏数量）；
- ✅ 嵌套空间：白名单看板在子空间 → 根空间与子空间均可见；
- ✅ RPC 返回空/异常 → 空间、图表、看板全部为空（fail-closed）；
- ✅ 白名单看板不会被空间 scope 二次过滤（空间 scope 只在条目层生效）；
- ✅ 浏览空间时的子空间列表同样按 scope 过滤。

**单测覆盖**

- `packages/backend/src/services/ContentService/ContentService.test.ts`：
  空间 scope 过滤、看板白名单过滤、图表 scope 过滤、子空间继承、非 client-use 不受影响；
- `packages/backend/src/services/DashboardService/DashboardService.test.ts`：
  `getViewerContentScope`（undefined / 空集 fail-closed / 反推图表空间）/ `resolveDashboardContextForMetadata` /
  白名单与 scope 缓存（并发合并、TTL、失败重试、主动失效）；
- `packages/frontend/src/utils/categoryFilters.test.ts`：类目重置与级联（见
  [`docs/category-filter-cascade.md`](./category-filter-cascade.md)）。

**手工验证 SQL（生产库只读）**

```sql
-- 品牌CT 项目下空间公开性分布
SELECT s.is_private, count(*)
FROM spaces s JOIN projects p ON p.project_id = s.project_id
WHERE p.name = '品牌CT' AND s.deleted_at IS NULL
GROUP BY s.is_private;

-- 白名单看板（1 个）所属空间 + 其磁贴图表
SELECT d.dashboard_uuid, d.name, d.space_uuid
FROM dashboards d JOIN projects p ON p.project_id = d.project_id
WHERE p.name = '品牌CT' AND d.deleted_at IS NULL;

-- 该用户是否有空间级授权
SELECT sua.space_uuid, sua.space_role
FROM space_user_access sua
JOIN users u ON u.user_id = sua.user_id
WHERE u.email = '18522948433@brandtct.cn';
```

---

## 8. 风险与回滚

| 风险                                   | 缓解                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 白名单看板未引用的独立图表对客户不可见 | 与客户确认同步系统是否覆盖图表；必要时升级为方案 C                                                    |
| RPC 不可用导致客户"什么都看不到"       | 告警 + 明确 fail-closed 决策；短缓存降低抖动影响                                                      |
| 空间 count 重算导致列表分页/总数变化   | 同步调整 `ContentService` 的 `shouldFilterInMemory` 逻辑与前端分页展示                                |
| 非 client-use 项目被误伤               | 所有 scope 判断以 `is_client_use && isClientUseRestrictedProjectRole` 为前置条件                      |
| 回滚                                   | 改动集中在 scope 判定处，可用 feature flag（如 `LIGHTDASH_CLIENT_USE_CONTENT_SCOPE_ENABLED`）一键关闭 |

---

## 9. 待确认（产品 / 客户）

1. **RPC 未配置时的期望行为**：目前是"跳过过滤"（fail-open），建议改为 fail-closed。
   → 影响面：未配置 RPC 的 client-use 部署会变成"什么都看不到"，需先确认客户环境。
2. **客户同步系统（RPC）是否只同步看板**：目前实现假设"只同步看板"（方案 B）。
   → 若客户还会做"整空间授权"，需要升级为方案 C（RPC 直接返回图表/空间清单）。
3. **客户自助新建的图表（未挂到任何看板）当前完全不可见**
   （`chartUuids` 只含白名单看板磁贴图表）。
   → 需与客户确认是否符合预期。
4. **匿名 / Embed 用户**：没有 `userUuid` → 无法按手机号解析白名单 → 不做 scope 过滤
   （沿用原有空间权限模型）。→ 需确认 embed 场景是否也要求客户隔离。
5. **MCP `get_my_access` 新增 `contentScope` 字段是否影响现有 agent 提示词/行为？**
   → 需与交付方对齐（见 5.4）。

---

## 附录：涉及文件清单（commit `fe7c504ef`）

**新增**

- `packages/common/src/types/clientUseScope.ts`（`ViewerContentScope` / `ViewerContentScopeUser` / `ViewerContentScopeResolver`）
- `packages/backend/src/services/ClientUseScopeService/clientUseScope.ts`（scope 解析与断言）

**后端修改**

- `packages/common/src/index.ts`（导出新类型）
- `packages/backend/src/services/DashboardService/DashboardService.ts`（`getViewerContentScope`、`resolveDashboardContextForMetadata`）
- `packages/backend/src/services/DashboardService/DashboardService.test.ts`
- `packages/backend/src/services/ContentService/ContentService.ts`
- `packages/backend/src/services/SavedChartsService/SavedChartService.ts`
- `packages/backend/src/services/SavedSqlService/SavedSqlService.ts`
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`
- `packages/backend/src/services/ProjectService/ProjectService.ts`（可信 dashboard context）
- `packages/backend/src/services/ServiceRepository.ts`（注入 resolver）
- `packages/backend/src/models/DashboardModel/DashboardModel.ts`
- `packages/backend/src/models/SpaceModel.ts`
- `packages/backend/src/ee/services/McpService/McpService.ts`
- `packages/backend/src/ee/services/AiAgentService.ts`

**关联文档**

- [`docs/category-filter-cascade.md`](./category-filter-cascade.md)（类目筛选器与 dbt 行级过滤）
