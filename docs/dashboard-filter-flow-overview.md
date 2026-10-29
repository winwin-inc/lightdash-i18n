# 看板筛选器全流程梳理与功能保全清单

> 分支：`feat/tab-filter-category-binding`
> 目的：把「全局筛选器 / Tab 筛选器 / 类目层级联动 / 跨 Tab 继承 / 重置」的完整流程写清楚，
> 并把每条已交付的能力钉到**代码路径 + 测试 + 手工验收**上，避免后续优化（尤其"减少请求"）把功能弄丢。
> 关联文档：[类目联动](./category-filter-cascade.md)、[跨作用域绑定](./category-filter-cross-scope-binding.md)、
> [类目不联动排查](./category-filter-not-cascading-diagnosis-plan.md)、[筛选器性能](./dashboard-filter-performance-investigation.md)

---

## 一、数据模型（先对齐概念，避免"同一个词两种意思"）

| 概念                                              | 存放                                       | 说明                                                                          |
| ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| 全局筛选器                                        | `dashboard_versions.config.filters`        | 对所有 Tab 生效（可用 `isGlobalFilterEnabled` 关闭整行）                      |
| Tab 筛选器                                        | `dashboard_tabs.filters`                   | 只对某个 Tab 生效（可用 `isTabFilterEnabled[tabUuid]` 关闭）                  |
| 查看者的运行时取值                                | 前端内存 `dashboardFilters` / `tabFilters` | **不落库**；刷新即回到作者默认值                                              |
| 作者默认值                                        | 上面两个服务端快照                         | 「重置」的还原目标                                                            |
| `disabled`                                        | 规则字段                                   | **含义 = 当前没有生效取值**（编译器渲染 `1=1`）。**不是**「作者禁用该筛选器」 |
| `categoryLevel`                                   | 规则字段 1..4                              | 作者声明的类目层级；缺失时按列名 `cls_1..cls_4` 推导（跨 mart 兜底）          |
| `parentFieldId` / `parentScope` / `parentTabUuid` | 规则字段                                   | 类目父子绑定；`parentScope='global'` 表示父级是全局筛选器                     |

---

## 二、七条流程（每条都写清"触发 → 路径 → 产出"）

### 流程 1：首屏加载

1. `dashboardFilters === emptyFilters` 时用服务端快照初始化全局筛选器 + 所有 Tab 的筛选器（`DashboardProvider` 的加载 effect）。
2. 有类目筛选器 → `isGlobalCategoryResolutionPending = true` + `armCategoryResolutionTimeout(10s)`，图表先不查。
3. 全局类目初始化：`runGlobalCategoryInit` → `initializeCategoryFiltersAsync(filters, …, {recoverableFilterIds, session})`。
4. 当前 Tab 的类目初始化：`runTabCategoryInit(activeTabUuid, filters)` →
   `initializeCategoryFiltersAsync(filters, …, { scope: { location, chain: buildCategoryChain(...) } })`。
5. `markGlobalCategoryProcessed` / `markTabCategoryProcessed` 记签名，避免同签名重复解析。

- **不会**给未激活的 Tab 发请求（签名未处理 → 切过去时才解析）。

### 流程 2：用户改「全局」类目筛选器

`updateDimensionDashboardFilter`（wrapper）→

1. `shouldCascadeCategoryFilterUpdate` 判定（编辑模式 / 临时筛选器 → 不级联，直接落值）。
2. 先落用户选择 `originalUpdateDimensionDashboardFilter` + `markGlobalCategoryProcessed`（用户显式选择优先）。
3. `updateGlobalCascadeWithFieldSearch`：
   - `updateCrossScopeCategoryCascadeAsync({globalFilters, tabFilters}, rule, newValue, …, { activeTabUuid })`
     → 只级联「全局 + **当前** Tab」（`updateCategoryCascadeForLocationsAsync`，每个作用域只写回自己）；
   - 再 `initializeCategoryFiltersAsync(global, …, { skipFilterIds:[changed], onlyFilterIds: 后代的 id })`。
4. 写回：`globalCategoryCascadeGenerationRef` + `shouldApplyCategoryInitResult` 双重守卫；
   Tab 侧写回后 `markTabCategoryProcessed(tab, filters, refinedGlobal)` + `clearTabCategoryDisplay(tab)` + `setHaveTabFiltersChanged`。

### 流程 3：用户改「Tab」类目筛选器

`updateTabDimensionFilter`（wrapper）→

1. `syncSelectionToAllTabs(item, 'dimension', uuid)`：把取值同步到其它 Tab（见流程 4）。
2. **接收方只作废解析状态、不发请求**（`invalidateTabCategoryState(changedTabUuids)` + pending=true + 标记已修改）。
3. 当前 Tab：`buildOptimisticCategoryDisplayState`（乐观展示：本级立即变，子孙标记"更新中"）→
   `updateTabCascadeWithFieldSearch` = `updateCategoryFilterCascadeAsync` + `initializeCategoryFiltersAsync(…, {skipFilterIds:[changed], onlyFilterIds: 后代})`。
4. 写回守：`tabCategoryCascadeGenerationRef`（世代）+ 会话未取消；`finally` 兜底清展示态（无论成功/被拒/失败）。

### 流程 4：跨 Tab 取值继承（**本次重点改的地方**）

触发：流程 3 第 1 步。

1. `applySelectionToTabFilters` 遍历其它 Tab，按「同一个筛选器」匹配（见流程 7）+ 兼容闸门（见流程 8）；
2. 命中且值/生效状态有变化 → 写 `values` + `disabled`（源码清空则同步为"任何值"）；
   接收方是动态日期默认（`singleDate`/`dateRange` dynamic）→ 剥掉，否则查询前 preset 会覆盖继承值；
3. **不再在后台为接收 Tab 跑级联/初始化**（曾导致一次操作十几个 `field/search`）。
   现在只做：`invalidateTabCategoryState([...接收 Tab])` —— bump init/cascade 两个世代、取消在途会话、
   删除 `pending/processed` 签名、清展示态；并 `pendingTabCategoryResolutions[tab]=true`（图表别抢跑）、
   `setHaveTabFiltersChanged[tab]=true`（让「重置全部筛选」出现）；
4. 用户切到该 Tab 时由**流程 6** 按那个 Tab 自己的 mart/权限解析 → 有权限则保留继承值并继续联动子级。

### 流程 5：重置（查看模式「重置全部筛选」）

`resetTabFilters`（wrapper）→

1. 计算出会被连带恢复的其它 Tab（同字段，含跨 mart 同级类目）→ `restoreAuthorDefaults`（**含 `disabled`**、`settings`、动态默认）；
2. 先 `invalidateTabCategoryState([当前 Tab + 被恢复的 Tab])` 再写状态，避免"重置后被晚到的级联写回"；
3. 当前 Tab 直接回它自己的服务端快照；其它 Tab 各回自己的快照；
4. pending 按"该 Tab 是否有类目筛选器"重建 + arm 超时 → 作者默认值也重新按权限解析；
5. `haveTabFiltersChanged` 全部置 false。

单条移除（`clearTabFilterSelection`）同源：只恢复该字段，跨 Tab 同步恢复，并 `invalidateTabCategoryState`。

### 流程 6：切换 Tab

`activeTabUuid` / `activeTabFilters` 变化 → effect → `runTabCategoryInit`：

- `resolveActiveTabCategoryInit` 比对**链签名**（全局 + 该 Tab）与已处理签名：
  `skip-already-processed`（无变化）/ `start`（值变了，例如刚被继承）；
- start → 新建会话（取消旧的）→ `initializeCategoryFiltersAsync`（整条链：校验每一级 + 按数据补值）；
- 完成 → `markTabCategoryProcessed`、清展示态、`pendingTabCategoryResolutions[tab]=false`（图表开始查询）。

⇒ 这是「懒解析」的落点：**未激活的 Tab 只有当它被打开时才花请求**。

### 流程 7：「是不是同一个筛选器」（跨 Tab/跨 mart 匹配）

`findMatchingRuleIndices`：

1. 精确命中：`namespace + tableName + fieldId` 全等（命中后**不再**兜底）；
2. 否则类目兜底：两侧都是 dimension、非 SQL 列、且**有效类目层级相同**；
   有效层级 = 显式 `categoryLevel` ?? 列名推导（`cls_1..cls_4` / `cls1..cls4`）；
3. SQL 列按 rule id；日期/普通字段不做兜底。
   同一套逻辑同时用于**继承**与**重置**。

### 流程 8：能不能继承这些取值（兼容闸门）

`isRuleSelectionCompatible`（不兼容 → DEV 日志写明 reason，接收方保持原样）：

- `operator` 必须相同；
- 类目：`categoryLevel` 相同即可（**忽略 `parentFieldId`**，各 Tab 父级绑定天然不同）；
- 非类目：`parentFieldId` 必须相同；
- `fallbackType`：两边都声明时必须相同；
- 日期形态：`unitOfTime`、`completed`、`singleDate.mode`、`dateRange.mode`、`dateRangeGranularity` 逐项比对；
  来源是动态默认 → 拒绝（占位值无法搬）；接收方是动态默认 → 允许，写入后剥掉动态默认；
- `disabled` **不再是拒绝条件**（"任何值"要能被写值并启用）。

---

## 三、功能保全清单（每条都能追到代码 + 测试）

| #   | 能力                                                                                   | 代码落点                                                                                                             | 测试 / 验收                                                                                                    |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| F1  | 父子类目联动（同 Tab，含跨 mart 字段重映射）                                           | `categoryFilters.cascadeChildrenAsync` + `remapRuleToTable`                                                          | `categoryFilters.test.ts`、`categoryFiltersCrossScope.test.ts`                                                 |
| F2  | 全局 ⇄ Tab 跨作用域绑定（`parentScope`/`parentTabUuid`，含兜底）                       | `findParentCategoryEntry`、`buildCategoryChain`                                                                      | `categoryFiltersCrossScope.test.ts`                                                                            |
| F3  | 子级"有值才跟随、无值不跟随"，断链清空后代                                             | `shouldCascadeCategoryFilter`、`clearDescendantsAsync`                                                               | `categoryFilters.test.ts`（4 条语义用例）                                                                      |
| F4  | 未绑定父级的类目不参与联动                                                             | `getChildEntries`（依赖 `findParentCategoryEntry`）                                                                  | `categoryFilters.test.ts`                                                                                      |
| F5  | 跨 Tab 继承取值（任何值 → 启用；源清空 → 清空；跨 mart 同名列；两边都任何值 → 零写入） | `applySelectionToTabFilters` / `applySelectionValues` / `findMatchingRuleIndices`                                    | `userFilterSelections.test.ts`（61 例，含无变化不写、跨 mart、disabled 跟随）                                  |
| F6  | 时间筛选器严格同形态才继承；动态默认被剥掉                                             | `getDateShape` / `getSelectionIncompatibility` / `stripDynamicDateSettings`                                          | `userFilterSelections.test.ts`（日期形态 5+5 例）                                                              |
| F7  | 接收方按自己的数据/权限解析（无权限不会被套上别处的类目）                              | 流程 6 `initializeCategoryFiltersAsync`（切 Tab 时校验当前值是否在候选里，不在则取该 Tab 第一个合法类目）            | 手工：客户账号在该 Tab 无权限的类目 → 切过去后回落为该 Tab 合法类目；日志 `Could not confirm …` / `Cascaded …` |
| F8  | 重置回到作者默认值（值 + 生效状态 + 动态默认），不被在途请求写回                       | `invalidateTabCategoryState` + `restoreAuthorDefaults`                                                               | `userFilterSelections.test.ts`（restore 相关 7 例）                                                            |
| F9  | 编辑模式不级联、不继承；进入编辑模式用服务端快照重置                                   | `shouldCascadeCategoryFilterUpdate`、`canApplyCategoryFilters`、编辑模式 effect                                      | 手工：编辑态改类目 / 保存                                                                                      |
| F10 | 类目解析期间图表不抢跑（含未激活但已挂载的 Tab）                                       | `pendingTabCategoryResolutions` 被 `DashboardChartTile`/`useDashboardChartReadyQuery` **按 tabUuid** 读取 + 10s 兜底 | `useDashboardFilterScope.test.ts`、手工看 Network                                                              |
| F11 | 请求量可控：未激活 Tab 零请求；一次操作只算当前 Tab；只重算被改级别的后代              | 流程 4 第 3 步（懒作废）+ `onlyFilterIds`                                                                            | 日志 `[category-cascade] cascade finished { fieldSearchRequests }`；手工数 Network                             |
| F12 | 诊断可见：身份/兼容/无变化/多命中/回退/请求数                                          | `[cross-tab-inherit]`、`[category-cascade]`（DEV-only）                                                              | 控制台                                                                                                         |

---

## 四、请求量对照（同样一次「改一级类目」）

| 场景                         | 改前（后台预解析所有 Tab）            | 现在（懒解析）                  |
| ---------------------------- | ------------------------------------- | ------------------------------- |
| 当前 Tab                     | 级联各级（3~4） + 初始化（后代，0~3） | 同（已限制为后代）              |
| 每个**未激活**接收 Tab       | 1 次校验 + 每级 1 次（≈4）            | **0**                           |
| 每个**已激活过**接收 Tab     | 同上（立即）                          | 0（等下次切过去，1 次整链解析） |
| 6 Tab × 4 级看板，一次改一级 | ≈ 3 + 5×4 = 23 次                     | ≈ 3~4 次                        |

代价（有意取舍）：接收 Tab 的取值在被打开**之前**不做权限校验；打开时若该值在它自己的候选里就保留并继续联动，
否则回落到该 Tab 自己的第一个合法类目（原先是"回退成打开前的旧值"，现在统一按该 Tab 自己的数据解析）。
数据正确性不受影响：未打开的 Tab 不会渲染/查询图表。

---

## 五、状态机与守卫（优化时不要动这些）

| 守卫                                              | 作用                 | 破坏后的症状                           |
| ------------------------------------------------- | -------------------- | -------------------------------------- |
| `tabCategoryInitGenerationRef[tab]`               | 作废旧初始化结果     | 切 Tab 后被旧结果覆盖                  |
| `tabCategoryCascadeGenerationRef[tab]`            | 作废旧级联结果       | 快速连选时值回弹                       |
| `categoryRequestSession`（init / cascade 各一套） | 取消排队中与在途请求 | 仓库被打满、旧结果晚到                 |
| `tabCategoryPendingSignatureRef[tab]`             | 同签名不重复起任务   | 重复请求/重复动画                      |
| `tabCategoryProcessedSignatureRef[tab]`           | 已解析签名不重复解析 | 切 Tab 反复请求                        |
| `pendingTabCategoryResolutions[tab]` + 10s 超时   | 图表等待最终类目     | 先出错版数据再刷新 / 永久转圈          |
| `CATEGORY_RESOLUTION_MAX_WAIT_MS = 10000`         | pending 兜底         | 仓库卡住时看板一直空转                 |
| `tabCategoryDisplayFilters[tab]`                  | 乐观展示（"更新中"） | pill 卡在 loading（已有 finally 兜底） |

---

## 六、手工验收脚本（每次改筛选器相关代码都跑一遍）

1. **首屏**：4~6 Tab 看板打开 → 只发当前 Tab 的请求；Network 里没有其它 Tab 的 `field/search`。
2. **同 Tab 联动**：改一级类目 → 二/三/四级自动落到该父级下第一个合法类目；pill 不卡"更新中"。
3. **跨 Tab 继承**：切到另一个 Tab → 一级类目已是同一个值（灰色"任何值"的筛选器变有值且生效），
   二/三/四级按该 Tab 数据解析；Network 只有**这一个** Tab 的请求。
4. **跨 mart**：两个 Tab 的类目 fieldId 不同（`group_cls4_…` vs `brand_cls3_…`）→ 仍继承；日志 `matchKind: 'category-level'`。
5. **时间**：两个 Tab 都是「近 N 个月」→ 继承；一个是「月份等于」→ 不继承（日志 `operator-mismatch` / `date-*`）。
6. **无权限**：目标 Tab 没有该值 → 切过去后回落为该 Tab 合法类目；日志给出 `Cascaded …` 或者保留原值的原因。
7. **重置**：改多个 Tab 后点「重置全部筛选」→ 各 Tab 回到各自作者默认值（含"任何值"、含动态默认），
   之后没有任何请求把值写回；切 Tab 不出现 10s 空转。
8. **编辑模式**：编辑态改类目 / 保存 / 退出 → 查看者的取值不写回看板配置。
9. **快速连选**：500ms 内连续改两级 → 最终值正确、没有回弹、Network 无堆积。
10. **日志**：`[category-cascade] cascade finished { fieldSearchRequests }` 与 Network 计数一致。

---

## 七、本次优化前后的差异（明确取舍）

| 项                       | 优化前                   | 优化后                                                             | 影响                                 |
| ------------------------ | ------------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| 接收 Tab 的类目解析时机  | 改值当时，后台全部解析   | 用户切到该 Tab 时                                                  | 请求量大降；未打开 Tab 不花仓库资源  |
| 接收 Tab 无权限取值      | 当时回退成"打开前的旧值" | 打开时按该 Tab 数据解析（保留合法值，否则取该 Tab 第一个合法类目） | 语义等价于"有权限才生效"，实现更简单 |
| 初始化范围               | 整条链（含祖先）         | 只处理被改级别的后代（`onlyFilterIds`）；切 Tab 仍是整链           | 少了祖先重复查询                     |
| 叶子级（无后代）         | 仍跑一次完整初始化       | 只做取值同步，不额外查询                                           | 请求更少                             |
| 首屏 / 切 Tab 的 pending | 不变                     | 不变                                                               | —                                    |
