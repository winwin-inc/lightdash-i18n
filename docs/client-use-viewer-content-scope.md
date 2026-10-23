# client-use 受限角色（viewer / interactive_viewer）内容可见性设计

> **状态**：已实施并合入 `dev`。
> 主要提交（分支 `fix/bugs` → `dev`）：
>
> | commit                                  | 内容                                                      |
> | --------------------------------------- | --------------------------------------------------------- |
> | `fe7c504ef`                             | 初始方案：内容范围 + 类目筛选器重置联动                   |
> | `6e7d2851b` / `f4d57dc74` / `5067f4710` | 过滤落点修正、空间口径改为看板驱动、补齐空间/图表列表入口 |
> | `9429e1bac` / `b782baed6`               | 空间口径改为「可见内容 + 祖先」、角色解析顺序说明         |
> | `403289f61`                             | 诊断信息 + 置顶内容过滤                                   |
> | `d6ed865eb`                             | 修复空间查询 raw 数组绑定导致的 HTTP 500                  |
> | `c3a971575`                             | 搜索 / 热门 / 评论入口的 scope 过滤                       |
> | `77f62332b`                             | content-as-code 导出按 scope 过滤                         |
> | `edda2706a`                             | 诊断接入正式 locale key + TSOA 生成产物                   |
> | `281e825fe`                             | 看板跑数上下文归属校验 + SQL 图表权限校验                 |
>
> 本文档记录设计方案、落地口径与**排障对照表**，供后续维护与验收参考。

> 关联问题：客户「品牌 CT」项目，手机号 `18522948433` 的账号（组织角色=成员，项目角色=interactive_viewer）
> 通过 MCP 能看到 89 个空间 / 约 488 张已保存图表，而看板只看到 1 个。
> workbuddy 据此判定"该账号是管理员"，与实际角色不符。

---

## 0. 结论与快速排障

### 0.1 一句话结论

**不改数据（不去把公开空间改成私有），改读取侧：以 client-use 看板白名单为唯一可见性来源，
反推出「可见看板 / 可见图表 / 可见空间 / 可查数据集」四元集合（ViewerContentScope），
在内容列表、图表元数据、跑数三条路径上统一按该 scope 过滤（fail-closed）。**

- 公开空间保持公开（对项目内 editor+/admin 的可见性不变，符合"公开空间"语义）；
- client-use 受限角色的可见范围由客户的 RPC 白名单决定，与看板白名单口径一致；
- 图表跑数也纳入过滤，堵住"看板看不到但图表能跑出数据"的洞。

### 0.2 快速排障（线上"看不到内容 / 403"时按此顺序）

1. **先看诊断**：`GET /api/v1/user?projectUuid=<projectUuid>` → `results.clientUse`
   （状态、口径、手机号、白名单看板数、scope 计数）。前端空间页有可折叠诊断卡片。
   状态含义见 [5.9](#59-诊断信息resultsclientuse)。
2. **状态为 `rpc_empty` / `rpc_error`** → fail-closed，**全站内容为空**。
   此时"看不到 / 403"是**症状不是原因**，先修 RPC（`ADMIN_API_HOST` / `ADMIN_API_KEY` /
   手机号是否在客户白名单里），不要改权限代码。
3. **状态为 `rpc_ok` 但仍被拦** → 内容确实不在白名单，属正常拦截；
   用 [5.12](#512-跑数与读取的-403-可观测点) 的错误文案定位是哪一道校验。
4. **状态为 `role_not_restricted`** → 该账号不是受限角色，scope 不生效；
   若仍被拦，看错误文案里是否是**空间权限**类（CASL）而非客户使用模式类。
5. **状态为 `not_client_use`** → 项目没开客户使用模式，本文档的过滤全部不适用。

---

## 1. 问题现状（代码证据）

client-use 模式（`projects.is_client_use = true`）在改造前**只对看板和 ad-hoc 查询做了白名单过滤**，
空间与已存图表**完全绕过**：

| 入口                             | 改造前过滤                           | 是否受白名单约束 |
| -------------------------------- | ------------------------------------ | ---------------- |
| 看板列表                         | RPC 白名单（按手机号）               | ✅               |
| 数据集/表元数据（catalog）       | 白名单派生 explore 名单              | ✅               |
| ad-hoc 指标查询                  | `assertExploreAllowedForAdhocQuery`  | ✅               |
| **空间列表**                     | 仅空间权限（public 或 space access） | ❌               |
| **已存图表列表**                 | 同上（按图表所属空间）               | ❌               |
| **图表元数据 `get_saved_chart`** | 同上                                 | ❌               |
| **图表跑数 `run_saved_chart`**   | 仅空间权限 + `view Project`          | ❌               |
| **看板磁贴跑数**                 | 仅空间权限                           | ❌               |

根因：空间/图表的判据是 `hasViewAccessToSpace`，而 viewer 的能力规则里
`can('view','SavedChart',{ projectUuid, isPrivate:false })`（`packages/common/src/authorization/projectMemberAbility.ts`）
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
| **B. 看板反推 scope（读取侧过滤）** | 以白名单看板为唯一入口，反推可见图表/空间/数据集，三条路径统一过滤 | ① 与客户同步系统（RPC）口径一致；② 新增内容自动继承，无需人工维护空间可见性；③ 不动生产数据，可灰度、可回滚；④ 顺带堵住跑数漏洞 | 需要新增 1~2 个聚合查询 + 缓存                                                                                                         | ✅ **已实施**                                                  |
| **C. RPC 扩展到图表/空间维度**      | 让客户同步系统直接返回可见图表/空间清单                            | 语义最清晰，可支持"整空间授权"                                                                                                  | 依赖客户系统改造，周期长                                                                                                               | 🕐 备选（B 可平滑升级到 C：scope 来源换成 RPC 返回的清单即可） |

---

## 4. 公开空间怎么处理

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

`scope.spaceUuids` 的定义（**可见内容 + 祖先**口径）：

> 可见空间 = 持有可见内容的空间 ∪ 这些空间的所有祖先。
> 持有可见内容 = 有白名单看板 ∪ 有可见图表（白名单看板的磁贴图表）。
>
> 既无可见内容、也没有可见后代的空间 → 整个移除（连空间名都不泄露）。

效果举例（品牌 CT，RPC 只授权 1 个看板「新品月报」）：

- 该看板所在空间 → 可见；
- 该空间内**其他看板** → 不可见；
- 该看板磁贴引用的 7 张表对应的图表 → 可见、可跑数（即使图表存放在别的空间）；
- 该看板磁贴引用图表所在的空间 → **可见**（图表能看，空间就不能消失）；
- 上述空间的**父空间 / 根空间** → 可见（否则空间树无法导航）；
- 其余 88 个空间、其余约 480 张图表 → **不可见、不可跑数**；
- 空间列表里，没有任何可见内容的公开空间 → **不出现**（连空间名都不泄露）。

### 4.3 什么时候仍然建议做空间私有化

即使代码侧已按 scope 过滤，仍建议客户做一次空间可见性治理（**运维建议，非代码前置条件**）：

1. 品牌方内部不同角色之间的隔离，公开空间会让任何项目成员看到全部内容；
2. 私有空间还能额外保护"看板磁贴之外"的散落图表（即便 scope 过滤已挡住，私有空间是第二道防线）；
3. 便于将来关闭 client-use 白名单时仍有基本隔离。

建议做法：把与客户交付无关的空间设为私有 + 配 `space_user_access`（含组授权），并保留
"客户授权看板所在空间"为公开（便于客户侧协作）。

> ⚠️ 与方案 B 冲突：若把客户授权看板所在空间设为私有，白名单推导出的空间可见性会变窄，
> 需回归验证后再做。本轮**未执行**任何生产数据修改。

### 4.4 角色解析顺序（只看项目权限）

白名单是否生效，取决于**有效项目角色**（`DashboardService.getAllowedDashboardUuidsForViewer`，
逻辑为原有实现，本次未改动）：

```
有效项目角色 = 直接项目成员角色(project_memberships)
             ?? 组成员角色(group_memberships + project_group_access)
             ?? convertOrganizationRoleToProjectRole(组织角色)   ← 兜底
```

只有落到 `viewer` / `interactive_viewer`
（`isClientUseRestrictedProjectRole`，`packages/common/src/utils/projectMemberRole.ts`）
才启用 scope 过滤，其余角色（editor / developer / admin）**完全不过滤**。

几条推论：

| 情形                                                | 有效项目角色                | scope    | 说明                   |
| --------------------------------------------------- | --------------------------- | -------- | ---------------------- |
| 终端用户：项目角色 viewer / interactive_viewer      | viewer / interactive_viewer | 生效     | 目标人群               |
| 客户自己的管理员：org admin，**没有**该项目成员身份 | admin（组织角色兜底）       | 不生效   | 看得见全部内容，能维护 |
| org admin，但在该项目里被单独设成 viewer            | viewer                      | **生效** | 见下方注意事项         |
| 空间级角色（space admin 等）                        | 不参与判定                  | —        | 空间角色不改变项目角色 |

**注意事项（部署口径）**：

> 受控项目里**不要**给客户的组织管理员单独设 viewer / interactive_viewer 身份。
> 否则他在该项目里会被当作受限用户，且其手机号通常不在 RPC 白名单里 →
> fail closed → 该账号在受控项目里**什么都看不到**（管理员视图里也只剩白名单内容）。

前端「管理员内容视图」开关由 CASL 的 `manage Project` 决定（组织 admin 恒有），
而后端 scope 由**项目角色**决定，两者在上面的第三种情形下不一致：

- 该开关是**纯前端显示过滤**，切的是后端已经过滤过的数据 → **不会泄露**；
- 直接用 URL 打开非白名单看板 → `DashboardService.getByIdOrSlug` 抛 `ForbiddenError`；
- 已知该组合会让"管理员内容视图"看起来"只有几个空间"，属于文案困惑，不是权限漏洞；
  确需消除时，让前端按 `results.clientUse`（见 5.9）渲染真实范围。

---

## 5. 详细设计

### 5.1 新增类型

```ts
// packages/common/src/types/clientUseScope.ts
export type ViewerContentScope = {
  dashboardUuids: string[]; // RPC 白名单看板
  chartUuids: string[]; // 白名单看板磁贴引用的图表（saved_query_uuid + saved_sql_uuid）
  spaceUuids: string[]; // 可见空间：持有可见内容的空间 ∪ 这些空间的所有祖先
  exploreNames: string[]; // 白名单看板用到的 explore（ad-hoc 查询口径）
};
```

语义约定：

- `undefined` = 本次请求**不适用 scope 过滤**（非 client-use 项目 / 角色不受限）→ 保持现状；
- 数组（可为空）= **生效**且为空 → 什么都看不到（fail-closed）。

### 5.2 后端计算 scope

在 `DashboardService` 新增（紧邻 `getAllowedDashboardUuidsForViewer`）：

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
4. `spaceUuids`：**可见内容 + 祖先**口径（详见 5.8）
   - `DashboardModel.getSpaceUuidsByDashboardUuids(dashboardUuids)`（新增）→ 白名单看板所属空间；
   - `DashboardModel.getSpaceUuidsByChartUuids(chartUuids)`（新增）→ 可见图表所属空间
     （`saved_queries.space_id` 与 `saved_sql.space_uuid` 两条来源）；
   - `SpaceModel.getSpaceUuidsWithAncestors(spaceUuids)`（新增，批量）→ 上述空间的**所有祖先**。

> 祖先用 ltree `path` 批量计算，join 限定 `target.project_id = ancestor.project_id`
> （path 由 slug 构成，跨项目可能重复）。

### 5.3 接入点总表（**所有**可能列出空间/图表/看板的入口）

> 判定原则：**任何一个会返回"内容列表 / 内容详情 / 可执行对象"的接口，都必须经过 scope**。
> 只改 content API 是不够的——空间选择器、空间详情页、搜索、置顶、热门、导出都会泄露。

| 接口                                                   | 服务方法                                           | 改法                                                                                     | 状态 |
| ------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---- |
| `GET /api/v2/content`                                  | `ContentService.find`                              | 条目层过滤：空间/图表按 scope，看板按白名单；计数按可见内容重算                          | ✅   |
| `GET /projects/:projectUuid/spaces`                    | `ProjectService.getSpaces`                         | 按 scope 过滤空间，并按可见图表重算 `chartCount`                                         | ✅   |
| `GET /projects/:projectUuid/charts`                    | `ProjectService.getCharts`                         | 按 `scope.chartUuids` 过滤                                                               | ✅   |
| `GET /projects/:projectUuid/chart-summaries`           | `ProjectService.getChartSummaries`                 | 按 `scope.chartUuids` 过滤                                                               | ✅   |
| `GET /projects/:projectUuid/spaces/:spaceUuid`         | `SpaceService.getSpace`                            | 过滤 `queries`（图表）、`childSpaces`（无白名单看板的子空间移除）                        | ✅   |
| `GET /projects/:projectUuid/dashboards`                | `DashboardService.getAllByProject`                 | 已有 RPC 白名单过滤                                                                      | ✅   |
| `GET /projects/:projectUuid/dashboards/:uuid`          | `DashboardService.getByIdOrSlug`                   | 已有 RPC 白名单过滤（URL 直达也拦住）                                                    | ✅   |
| `GET /projects/:projectUuid/saved/:uuid`               | `SavedChartService.get`                            | 已有 `checkPermissions` 的 scope 校验                                                    | ✅   |
| `GET /projects/:projectUuid/dashboards/context`        | `DashboardService.getDashboardContexts`            | 已有 RPC 白名单过滤                                                                      | ✅   |
| `GET /projects/:projectUuid/search`                    | `SearchService.getSearchResults`                   | 看板/标签按白名单过滤；图表按 `scope.chartUuids`、空间按 `scope.spaceUuids` 过滤         | ✅   |
| `GET /projects/:projectUuid/most-popular`              | `ProjectService.getMostPopularAndRecentlyUpdated`  | 空间按 `scope.spaceUuids`、图表按 `scope.chartUuids`、看板按 `scope.dashboardUuids` 过滤 | ✅   |
| `GET /pinned`（置顶列表）                              | `PinningService.getPinnedItems`                    | 置顶空间按 `scope.spaceUuids`、置顶图表按 `scope.chartUuids` 过滤                        | ✅   |
| `GET /projects/:projectUuid/dashboards/:uuid/comments` | `CommentService`                                   | 创建/读取/解决/删除评论均校验看板白名单                                                  | ✅   |
| `GET /projects/:projectUuid/dashboards/code`           | `CoderService.getDashboards`                       | 看板按白名单过滤，空间元数据同步收窄                                                     | ✅   |
| `GET /projects/:projectUuid/charts/code`               | `CoderService.getCharts`                           | 图表按 `scope.chartUuids` 过滤                                                           | ✅   |
| `GET /projects/:projectUuid/code/sqlCharts`            | `CoderService.getSqlCharts`                        | 图表按 `scope.chartUuids` 过滤                                                           | ✅   |
| `GET /projects/:projectUuid/code/spaces`               | `CoderService.getSpaces`                           | 空间按 `scope.spaceUuids` 过滤                                                           | ✅   |
| MCP 内容查找（dashboard/chart）                        | `McpService` / `AiAgentService`                    | finder 按 scope 过滤，分页总数按过滤后结果计算                                           | ✅   |
| `POST /query/dashboard-chart`（图表 / SQL 图表）       | `AsyncQueryService`                                | 看板归属校验 + 白名单校验（见 5.11）                                                     | ✅   |
| `POST /query/saved-chart`                              | `AsyncQueryService.executeAsyncSavedChartQuery`    | 图表 ∈ `scope.chartUuids`                                                                | ✅   |
| `POST /query/metric-query`（探索页 ad-hoc）            | `ProjectService.assertExploreAllowedForAdhocQuery` | explore ∈ `scope.exploreNames`                                                           | ✅   |
| 图表元数据（`get_saved_chart` 等）                     | `SavedChartService` / `SavedSqlService`            | 图表 ∈ `scope.chartUuids`                                                                | ✅   |

前端配合：内容列表的"空间"列改为使用 content API 返回的 `space.name`
（空间被隐藏时只显示文字、不给链接），避免出现空白单元格。

### 5.4 MCP / AI Agent——避免 agent 再次误判

问题根因：`packages/lightdash-mcp/src/mcp/access/abilityFromRules.ts` 的能力位只看"**有没有**对应规则"，
不看 conditions，于是 `can('view','SavedChart',{isPrivate:false})` 被当成"能看所有图表"，
agent 由此推断出"管理员"。

**已实施（后端侧）**：内置 MCP（`packages/backend/src/ee/services/McpService/McpService.ts`）
与 AI Agent（`packages/backend/src/ee/services/AiAgentService.ts`）的 dashboard / chart finder
已按 scope 过滤，即使 MCP 侧能力位判断偏粗，后端也不会真的把白名单外内容吐出去。

**未实施（待后续）**：

1. **MCP `get_my_access` 消费真实范围**：在
   `packages/lightdash-mcp/src/mcp/tools/registerAccessTools.ts` 的 `buildProjectAccess`
   增加 `contentScope` 字段；在描述里明确"能力位仅表示角色上限，实际可见范围以 contentScope 为准"。
   （后端侧的真实范围已经可以通过 `GET /api/v1/user?projectUuid=...` 的 `results.clientUse` 拿到。）
2. **能力位加限定**：把 `runSavedChart` 的描述从"可跑已存图表"改为
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

  | 缓存               | Key                    | TTL                    | 说明                                   |
  | ------------------ | ---------------------- | ---------------------- | -------------------------------------- |
  | `allowListCache`   | `projectUuid:userUuid` | 成功 30s / RPC 失败 5s | 失败结果只短暂缓存，RPC 恢复后尽快重试 |
  | `viewerScopeCache` | `projectUuid:userUuid` | 30s                    | scope 由白名单派生，两者 TTL 对齐      |

- 缓存条目上限 1000，超出后按插入顺序淘汰最旧条目；
  `DashboardService.clearViewerContentCache(projectUuid?)` 可主动失效。
- 效果：打开一个看板（10 个磁贴）时，RPC 调用从 ~22 次降到 1~2 次。

### 5.7 内容过滤的落点（重要）

`ContentService.find` 的 `spaceUuids` 过滤被空间、看板、图表三种查询**共用**，
因此客户使用模式的 scope **不能**通过收窄这个列表来生效——否则会连带把
白名单内的看板（及其磁贴图表）一起过滤掉（"有权限的看板不展示"）。

正确落点是**内容条目层（内存过滤）**：

| 内容类型 | 过滤条件                                                           |
| -------- | ------------------------------------------------------------------ |
| 空间     | 空间权限 ∩ scope.spaceUuids（空间自身 UUID；**含可见空间的祖先**） |
| 看板     | RPC 白名单（`allowedDashboardUuidsMap`，与空间 scope 无关）        |
| 图表     | scope.chartUuids（白名单看板的磁贴图表）                           |

空间过滤同时覆盖两种列表形态：根空间列表（`nlevel(path)=1`）与浏览空间的子空间列表
（`parent_space_uuid IN (...)`），后者此前会绕过空间 scope。

### 5.8 空间口径：可见内容 + 祖先

```
可见空间 = 持有可见内容的空间 ∪ 这些空间的所有祖先
持有可见内容 = 有白名单看板 ∪ 有可见图表（白名单看板的磁贴图表）
```

- **有可见图表 → 该图表所在空间可见**：图表能被看到，它所在的空间就不该消失；
- **祖先可见**：父空间本身没有可见内容，但它是子空间的容器，隐藏后空间树无法导航；
- 两者都不满足的空间（既无可见内容，也无可见后代）→ 整个移除。

祖先由 `SpaceModel.getSpaceUuidsWithAncestors` 批量计算（ltree `path`，
join 限定在同一 project 内，因为 path 由 slug 构成、跨项目可能重复）。

空间的访问权限继承仍由既有的 `hasViewAccessToSpace`（根空间可见即嵌套可见）负责，
与上面的可见性口径互不干扰。

### 5.9 诊断信息（`results.clientUse`）

`GET /api/v1/user?projectUuid=<projectUuid>` 的 `results.clientUse` 返回
客户使用模式诊断（状态、角色来源、手机号、白名单看板、scope 计数），
前端空间页有可折叠诊断卡片（默认收起，请求失败静默隐藏，不阻塞页面），
便于定位"看不到内容"的问题。

| 状态                  | 含义                                                   |
| --------------------- | ------------------------------------------------------ |
| `not_client_use`      | 项目未开启客户使用模式                                 |
| `role_not_restricted` | 有效项目角色不是 viewer / interactive_viewer           |
| `user_not_found`      | 找不到用户记录，无法解析手机号                         |
| `no_email`            | 用户没有邮箱，无法解析手机号                           |
| `rpc_not_configured`  | `ADMIN_API_HOST` / `ADMIN_API_KEY` 未配置（fail-open） |
| `rpc_error`           | Admin RPC 调用失败（fail-closed，内容不可见）          |
| `rpc_empty`           | RPC 返回空白名单（fail-closed，内容不可见）            |
| `rpc_ok`              | 正常，白名单与 scope 已生成                            |

诊断复用 allow-list / scope 缓存，不会因为打开诊断卡片而额外打 RPC。
未新增独立诊断接口（原计划的 `GET /projects/:uuid/my-content-scope` 已取消）。

### 5.10 已修复的线上故障

`GET /api/v2/content` 与 `GET /api/v1/projects/:projectUuid/spaces` 曾返回
HTTP 500（`UnexpectedServerError` / `invalid input syntax for type uuid`，
Sentry `877bb41b74d84a8ebd7358a6e025680f`）。

原因：knex 的 `raw` 查询不会把数组展开成 `IN (?, ?, ...)`，而是把整个数组
当作一个 Postgres 数组参数下发，数据库收到 `{"uuid1","uuid2"}` 这样的字面量，
无法转换为 `uuid`。

修复：`SpaceModel.getSpaceUuidsWithAncestors` 与
`SpaceModel.getVisibleChartCountsBySpaceUuids` 改为"每个 uuid 一个占位符 +
扁平标量绑定"，并补充了绑定形状的回归测试
（`packages/backend/src/models/SpaceModel.test.ts`）。

> 经验：`IN (?)` + 数组绑定在 knex raw 里是**高危写法**，新增 raw 查询一律用
> `buildInPlaceholders(count)` 生成独立占位符。

### 5.11 看板跑数的行级过滤上下文（sql_filter）

客户 dbt 的行级过滤依赖看板上下文：

```sql
${lightdash.user.dashboardSlug} = 'NA' or
EXISTS (SELECT 1 FROM marts.dim_ld_employee_categories
        WHERE category = ${TABLE}.cls_2
          AND email = ${lightdash.user.email}
          AND short_name = ${lightdash.user.dashboardSlug})
```

`dashboardSlug` 由 `getUserAttributes` 的 `intrinsicUserAttributes` 注入，
`email` 恒为当前登录用户。

| 跑数路径                                    | 上下文来源                                                        | 结论                                                 |
| ------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| `POST /query/dashboard-chart`（图表）       | 服务端 `dashboardModel.getByIdOrSlug(dashboardUuid)` 的 slug/name | ✅ 客户端 `context` 不参与 SQL（只进 analytics tag） |
| `POST /query/dashboard-chart`（SQL 图表）   | 同上                                                              | ✅ 同上                                              |
| `POST /query/saved-chart`（独立跑保存图表） | 无看板上下文 → `NA`                                               | ⚠️ `NA` 分支不过滤，见 5.13                          |
| `POST /query/metric-query`（探索页 ad-hoc） | 无看板上下文 → `NA`                                               | ⚠️ 同上                                              |
| MCP 查数                                    | MCP 服务端按 explore 反查白名单看板后注入                         | ✅ 口径与看板一致                                    |

本次补强（commit `281e825fe`）：

- 两条看板跑数路径都要求 `dashboard.projectUuid === projectUuid`，
  防止传入**其它项目**的看板 uuid 借用其 dashboard parameters 与行级口径；
- SQL 图表跑数路径补齐客户使用模式校验：SQL 图表必须挂在白名单看板上，
  且看板本身必须在白名单内（此前只校验了空间可见性）；
- 看板白名单校验改用服务端解析后的 `dashboard.uuid`（兼容 slug 入参）。

回归测试：`packages/backend/src/services/AsyncQueryService/AsyncQueryService.test.ts`
的 `dashboard query context` 用例（锁定"客户端伪造 slug 不影响行级过滤"）。

### 5.11.1 看板筛选器取值的白名单口径

看板上的筛选器（尤其是类目筛选器）需要读取维度值，走
`POST /projects/:projectUuid/field/:fieldId/search` → `ProjectService.searchFieldUniqueValues`。

该接口受 explore 白名单约束：

| 情形                                               | 结果                                      |
| -------------------------------------------------- | ----------------------------------------- |
| explore 在白名单内                                 | ✅ 允许取值                               |
| explore 不在白名单、且**没有**看板上下文           | ⛔ `ForbiddenError`                       |
| explore 不在白名单、看板上下文可信但该看板不筛选它 | ⛔ `ForbiddenError`                       |
| explore 不在白名单、看板上下文可信且该看板筛选它   | ✅ 允许取值（行级 `sql_filter` 仍然生效） |

“该看板筛选它”的判定：看板当前版本的 `filters.dimensions` / `filters.metrics`
里的 `target.tableName` 解析成 base explore 后命中请求的 explore
（表名可能是 join alias，解析顺序与 `_getFieldValuesMetricQuery` 一致：
先 `findExploreByTableName`，再 `findJoinAliasExplore`）。

> ⚠️ 早期实现是“有可信看板上下文就完全跳过白名单”，等于让任意受限角色
> 用任意看板 slug 去读任意表的值。现已收紧为只豁免“该看板自己筛选的表”。
> 回归测试：`ProjectService.test.ts` 的
> `should reject field values of a table the dashboard does not filter on` /
> `should allow field values of a table the dashboard filters on`。

### 5.12 跑数与读取的 403 可观测点

所有客户使用模式的拒绝都返回 **403 `ForbiddenError`**，
**错误文案是唯一的第一手定位线索**（文案本身不含手机号 / 看板名，不泄露内容）：

| #   | 错误文案                                                             | 抛出位置                                                                  | 触发条件                                                    | 是不是 bug                               |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| 1   | `Chart does not belong to project`                                   | `AsyncQueryService.executeAsyncDashboardChartQuery`（图表归属校验，既有） | 请求里的 `chartUuid` 属于**另一个项目**                     | 否                                       |
| 2   | `Dashboard does not belong to project`                               | `AsyncQueryService.executeAsyncDashboardChartQuery` / `...SqlChartQuery`  | 请求里的 `dashboardUuid` 属于**另一个项目**                 | 否（防跨项目借用 parameters / 行级口径） |
| 3   | `You don't have access to this chart in this project`                | `clientUseScope.assertChartInViewerContentScope`                          | 受限角色执行不在 scope 里的图表（dbt 图表或 SQL 图表）      | 否（图表必须挂在白名单看板上）           |
| 4   | `You don't have access to this dashboard in this project`            | `clientUseScope.assertDashboardInViewerContentScope`                      | 受限角色跑非白名单看板                                      | 否                                       |
| 5   | `You don't have permission to view this dashboard...`                | `DashboardService.getByIdOrSlug`                                          | 打开非白名单看板（URL 直达）                                | 否                                       |
| 6   | `You don't have access to this dashboard`                            | `DashboardService.resolveDashboardContextForMetadata`                     | 图表元数据请求带了非白名单看板的 slug                       | 否                                       |
| 7   | `You don't have access to the space this dashboard/chart belongs to` | CASL / 空间权限既有校验                                                   | 空间权限不足（**非**客户使用模式特有）                      | 视情况，与 scope 无关                    |
| 8   | `You don't have access to the explore {exploreName}`                 | `ProjectService.searchFieldUniqueValues`                                  | 受限角色读取不在白名单的 explore 取值（看板上下文不能绕过） | 否（见 5.11.1）                          |

> ⚠️ #1 与 #2 的文案必须保持不同：改动前两者都是 `Dashboard does not belong to project`，
> 排查时无法区分是"图表传错"还是"看板传错"。已修正并由单测锁定。

**排查顺序**：

1. 先取 `results.clientUse.status`（见 0.2）；
2. `rpc_ok` + 命中 #3/#4 → 内容确实不在白名单，正常拦截；
3. `rpc_empty` / `rpc_error` → fail closed 导致的全黑，**先修 RPC**，别动权限代码；
4. `role_not_restricted` → scope 不生效，命中 #7 才是权限问题；
5. 正常操作命中 #1 / #2 → 前端传错了 `chartUuid` / `dashboardUuid`（前端 bug），可从请求体复现。

**误伤面证明**（#1 为什么不会挡住正常查询）：

- 图表归属项目**早就**校验过（`savedChartProjectUuid !== projectUuid` → 403，改动前就有）；
- `dashboard.projectUuid` 来自 `space.project_id`，`getByIdOrSlug` 必定 select 到，不存在 undefined 误判；
- 前端两个 endpoint 的 `projectUuid` 与 `dashboardUuid` 同源（当前看板 + 当前项目）；
- `EmbedService.executeAsyncDashboardTileQuery` 用的是 embed 自己的看板 + embed 所属项目；
- embed / JWT 账号没有 `userUuid` → `toViewerContentScopeUser` 返回 `undefined` →
  scope 检查整体跳过，**嵌入看板不受新校验影响**。

### 5.13 已知限制（未处理，需客户确认）

`dashboardSlug = 'NA'` 时 dbt `sql_filter` 的首个分支为真，**不按类目过滤**。
因此受限角色在探索页做 ad-hoc 查询、或独立跑保存图表时，行级类目口径不生效
（内容层仍然受白名单约束）。

如需堵上，需要服务端按 explore 反查白名单看板并注入上下文（与 MCP 一致），
找不到候选则拒绝；这会改变受限用户探索页的返回行数，需客户确认后再实施。

---

## 6. 实施状态

| 阶段           | 内容                                                   | 状态                                                         |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| **P0**         | scope 计算 + 跑数 fail-closed                          | ✅ 已实施                                                    |
| **P1**         | 图表/空间元数据过滤 + 全部列表/搜索/置顶/评论/导出入口 | ✅ 已实施                                                    |
| **P2**         | MCP / AI Agent 内容查找按 scope 过滤（后端侧）         | ✅ 已实施（后端）；⛔ `lightdash-mcp` 侧 `contentScope` 未做 |
| **P2**         | 看板跑数使用服务端看板上下文 + 跨项目校验              | ✅ 已实施                                                    |
| **P2**         | 看板筛选器取值受 explore 白名单约束                    | ✅ 已实施（见 5.11.1）                                       |
| **P3**         | 诊断信息（`results.clientUse`）+ 前端诊断卡片          | ✅ 已实施                                                    |
| **P4（可选）** | 客户侧空间私有化治理（4.3）                            | ⛔ 运维建议，非代码前置条件                                  |

---

## 7. 验收标准

**P0**

- ✅ 受限角色执行白名单外图表 → `ForbiddenError`（`SavedChartService` / `SavedSqlService` /
  `AsyncQueryService` 三处校验）；
- ✅ 受限角色执行白名单内图表 → 正常返回数据；
- ✅ 看板磁贴跑数对白名单外看板 → `ForbiddenError`；
- ✅ editor/admin 跑数不受影响（scope 仅在受限角色生效）；
- ✅ 非 client-use 项目行为零变化（`getAllowedDashboardUuidsForViewer` 返回 `undefined` 时不过滤）。

**角色解析（见 4.4）**

- ✅ org admin 无该项目成员身份 → 兜底 admin → **不过滤**（看得见全部内容）；
- ✅ org admin 在该项目是 viewer / interactive_viewer → **按受限用户处理**（fail-closed）；
- ✅ 项目角色优先于组织角色；空间级角色不参与判定。

**P1**

- ✅ `find_spaces` / `find_charts` / v2 content API 只返回 scope 内内容；
- ✅ 空间 `chartCount`/`dashboardCount` 与实际可见内容一致（不泄露隐藏数量）；
- ✅ 嵌套空间：无可见内容的嵌套空间被移除；有可见内容的空间及其祖先可见；
- ✅ 可见图表所在空间可见（图表能看，空间就不会消失）；
- ✅ RPC 返回空/异常 → 空间、图表、看板全部为空（fail-closed）；
- ✅ 白名单看板不会被空间 scope 二次过滤（空间 scope 只在条目层生效）；
- ✅ 浏览空间时的子空间列表同样按 scope 过滤；
- ✅ 搜索 / 热门 / 置顶 / 评论 / content-as-code 导出一致。

**P2 看板跑数上下文（见 5.11 / 5.12）**

- ✅ 客户端伪造 `context.dashboardSlug` → 行级过滤仍用服务端 slug（已有行为，已加测试锁定）；
- ✅ 传入**外项目**的 `dashboardUuid` → 403 `Dashboard does not belong to project`；
- ✅ 传入**外项目**的 `chartUuid` → 403 `Chart does not belong to project`（两条文案可区分）
- ✅ 受限角色跑**挂在非白名单看板**上的 SQL 图表 → 403；
- ✅ 白名单看板上的 SQL 图表 → 正常返回数据；
- ✅ embed / JWT 账号 → 不受 scope 校验影响（`userUuid` 缺失 → scope 跳过）。

**P2 看板筛选器取值（见 5.11.1）**

- ✅ 受限角色读取白名单内 explore 的字段值 → 正常返回；
- ✅ 受限角色读取白名单外 explore 的字段值 → 403 `You don't have access to the explore ...`；
- ✅ 带可信看板上下文但看板不筛选该表 → 仍 403（上下文不能当成万能钥匙）；
- ✅ 带可信看板上下文且看板筛选该表 → 允许（行级 `sql_filter` 仍生效）；
- ✅ 非 client-use 项目 / 非受限角色 → 行为不变。

**单测覆盖**

- `packages/backend/src/services/ContentService/ContentService.test.ts`：
  空间 scope 过滤、看板白名单过滤、图表 scope 过滤、嵌套空间移除、非 client-use 不受影响；
- `packages/backend/src/services/ProjectService/ProjectService.clientUseScope.test.ts`：
  `getSpaces` 空间过滤与 `chartCount` 重算、`getCharts` / `getChartSummaries` 图表过滤、
  热门/最近更新、`hasSavedCharts`、scope 不适用时保持原行为；
- `packages/backend/src/services/SpaceService/SpaceService.test.ts`：
  空间详情的图表过滤、子空间移除、scope 不适用时保持原行为；
- `packages/backend/src/services/SearchService/SearchService.test.ts`：
  scope 外图表/空间隐藏、scope 不适用时行为不变；
- `packages/backend/src/services/PinningService/PinningService.test.ts`：
  scope 外置顶空间/图表隐藏、scope 不适用时保留全部；
- `packages/backend/src/services/CommentService/CommentService.test.ts`：
  白名单看板评论可读、白名单外拒绝、scope 不适用时保持原行为；
- `packages/backend/src/services/CoderService/CoderService.clientUseScope.test.ts`：
  导出接口按 scope 过滤看板/图表/空间；
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.test.ts`：
  `dashboard query context`（服务端 slug 锁定 + 跨项目 403 + SQL 图表权限）；
- `packages/backend/src/services/ProjectService/ProjectService.test.ts`：
  字段取值白名单（不在白名单 → 403、看板不筛选该表 → 403、看板筛选该表 → 允许）；
- `packages/backend/src/models/SpaceModel.test.ts`：祖先查询（结果映射、跨项目隔离、空入参不查库）
  - raw 绑定形状回归；
- `packages/backend/src/services/DashboardService/DashboardService.test.ts`：
  `getViewerContentScope`（undefined / 空集 fail-closed / 反推图表空间）/ `resolveDashboardContextForMetadata` /
  白名单与 scope 缓存（并发合并、TTL、失败重试、主动失效）；
- `packages/frontend/src/utils/categoryFilters.test.ts` + `categoryFilterInitHelpers.test.ts`：
  类目重置与级联（见 [`docs/category-filter-cascade.md`](./category-filter-cascade.md)）。

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

| 风险                                    | 缓解                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 白名单看板未引用的独立图表对客户不可见  | 与客户确认同步系统是否覆盖图表；必要时升级为方案 C                                                                                            |
| RPC 不可用导致客户"什么都看不到"        | 告警 + 明确 fail-closed 决策；短缓存降低抖动影响；用 `results.clientUse` 快速定位                                                             |
| **新增 403 校验误伤正常查询**           | 两道校验只作用于"跨项目看板"与"非白名单 SQL 图表"；正常路径同源（见 5.12 误伤面证明）；命中时报错文案明确区分（图表/看板/白名单三类互不混淆） |
| 空间 count 重算导致列表分页/总数变化    | 同步调整 `ContentService` 的 `shouldFilterInMemory` 逻辑与前端分页展示                                                                        |
| 非 client-use 项目被误伤                | 所有 scope 判断以 `is_client_use && isClientUseRestrictedProjectRole` 为前置条件                                                              |
| 组织管理员在受控项目被单独降级为 viewer | 项目角色优先 → 该账号按受限用户处理（可能全黑）。部署口径：不要给客户管理员单独降级项目角色（见 4.4）                                         |
| 回滚                                    | 改动集中在 scope 判定处，可按 commit 回滚（`git revert`）；未涉及数据迁移，回滚无副作用                                                       |

**回滚粒度**：

- 只回滚内容可见性 → `git revert` 本文档表格 5.3 中的后端改动；
- 只回滚看板跑数上下文校验 → `git revert 281e825fe`；
- 只回滚看板筛选器取值的白名单收紧 → `git revert c0cfca5b7`；
- 全量回滚 → 回滚到 `fe7c504ef~1`（初始实施之前）；
- **均不需要回滚数据**（本方案没有做任何生产数据修改）。

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
6. **受控项目里是否会出现"组织管理员被单独设成 viewer / interactive_viewer"？**
   → 若出现，该账号在受控项目里会被当作受限用户（且手机号通常不在 RPC 白名单里）→
   fail closed → 什么都看不到。当前策略**保持不变**（项目角色优先，见 4.4），
   处置方式是**部署口径**：不要给客户管理员单独降级项目角色。
   → 若客户坚持要"组织管理员在受控项目也不受限"，则需改为组织角色优先（影响面更大）。
7. **探索页 ad-hoc 的 `'NA'` 分支是否要堵？**（见 5.13）
   → 堵它会改变受限用户探索页的返回行数，需要客户确认。

---

## 附录：涉及文件清单

**新增**

- `packages/common/src/types/clientUseScope.ts`（`ViewerContentScope` / `ViewerContentScopeUser` /
  `ViewerContentScopeResolver` / 诊断类型）
- `packages/backend/src/services/ClientUseScopeService/clientUseScope.ts`（scope 解析与断言）
- `packages/backend/src/services/CoderService/CoderService.clientUseScope.test.ts`
- `packages/backend/src/services/CommentService/CommentService.test.ts`
- `packages/backend/src/services/PinningService/PinningService.test.ts`
- `packages/backend/src/services/SearchService/SearchService.test.ts`
- `packages/backend/src/services/ProjectService/ProjectService.clientUseScope.test.ts`
- `packages/frontend/src/hooks/useMyContentScope.ts`（诊断卡片数据）
- `packages/frontend/src/utils/categoryFilters.ts` + `.test.ts`（类目重置与级联）

**后端修改**

- `packages/common/src/index.ts`（导出新类型）
- `packages/common/src/types/user.ts`（`ApiGetAuthenticatedUserResponse.results.clientUse`）
- `packages/common/src/types/resourceViewItem.ts`（内容列表项带 `space`）
- `packages/backend/src/controllers/userController.ts`（`GET /api/v1/user?projectUuid=`）
- `packages/backend/src/services/DashboardService/DashboardService.ts`
  （`getViewerContentScope` / `resolveDashboardContextForMetadata` / 缓存）
- `packages/backend/src/services/ContentService/ContentService.ts`
- `packages/backend/src/services/SavedChartsService/SavedChartService.ts`
- `packages/backend/src/services/SavedSqlService/SavedSqlService.ts`
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`
- `packages/backend/src/services/ProjectService/ProjectService.ts`
- `packages/backend/src/services/SpaceService/SpaceService.ts`
- `packages/backend/src/services/SearchService/SearchService.ts`
- `packages/backend/src/services/PinningService/PinningService.ts`
- `packages/backend/src/services/CommentService/CommentService.ts`
- `packages/backend/src/services/CoderService/CoderService.ts`
- `packages/backend/src/services/ServiceRepository.ts`（注入 resolver / dashboardService）
- `packages/backend/src/models/DashboardModel/DashboardModel.ts`
- `packages/backend/src/models/SpaceModel.ts` + `SpaceModel.test.ts`（祖先查询 + raw 绑定形状回归）
- `packages/backend/src/ee/services/McpService/McpService.ts`
- `packages/backend/src/ee/services/AiAgentService.ts`
- `packages/backend/src/generated/routes.ts` / `swagger.json`（TSOA 生成产物）

**前端修改**

- `packages/frontend/src/pages/Spaces.tsx`（诊断卡片 + 空间列处理）
- `packages/frontend/src/components/common/ResourceView/InfiniteResourceTable.tsx`（空间列渲染）
- `packages/frontend/src/utils/categoryFilterInitHelpers.ts` + `.test.ts`（类目初始化顺序：先一级后四级）
- `packages/frontend/public/locales/{en,zh}/translation.json`（`pages_spaces.client_use_scope.*`）

**关联文档**

- [`docs/category-filter-cascade.md`](./category-filter-cascade.md)（类目筛选器与 dbt 行级过滤）
