# 看板筛选器「无值时隐藏关联图表」（含任何值候选探测）

> 状态：**已实施**
>
> 关联：[筛选器全流程](./dashboard-filter-flow-overview.md)、[类目联动](./category-filter-cascade.md)、
> [非类目字段绑定父级类目](./dashboard-filter-bound-values-cascade.md)、
> [集团筛选「任何值」dbt 方案](./集团筛选任意值与趋势图TOP15-dbt方案.md)

## 一、背景与目标

业务看板里大量存在「父级类目 → 子级维度表」的组合：例如「子系列」类目筛选器 +
「大区子系列」表格图表。当父级类目（子系列）**没有子系列可选**时，依赖它的图表
继续渲染一个空表/空图，既占版面又让查看者误以为「没数据」。

目标：给看板筛选器增加一个作者可配置的开关 **`hideTilesWhenEmpty`**（「无值时隐藏
关联图表」）。查看模式下，开启该开关的筛选器**当前无值**时，把它作用到的图表整块
隐藏。

判定口径刻意收敛为一条：**只看筛选器本身的取值/候选，不看图表查询有没有返回数据**。
即「图表是否被隐藏」在查询发起前就能确定，避免「空图闪烁后再消失」的体验，也避免
为每张图重复发探测请求。

数据模型：`DashboardFilterRule` 新增 `hideTilesWhenEmpty?: boolean`（common 类型，
随看板保存，无迁移）。

## 二、隐藏语义表

| 场景                         | 判定                                                                               | 行为                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 未开开关                     | `hideTilesWhenEmpty !== true`                                                      | 永不隐藏，行为与现状完全一致                                      |
| 非任何值 + 空值              | 值型算子（equals/include 等）且 `values` 为空 | **隐藏**作用图表 |
| 非任何值 + 多值 / 任一值     | `values.length > 0` | 不隐藏 |
| 任何值（`disabled`）+ 有候选 | 候选探测结果 `has`                                                                 | 不隐藏                                                            |
| 任何值 + 无候选              | 候选探测结果 `none`                                                                | **隐藏**作用图表                                                  |
| 任何值 + 探测失败 / 取消     | `unknown`                                                                          | **不隐藏**（宁可多显示，不能因接口故障误藏图表）                  |
| 任何值 + 探测中              | 尚未得到结果                                                                       | **保持上一次隐藏结果**；图表查询本来就被 pending 门禁拦住，不闪烁 |
| tile 被显式排除              | 该 tile 在筛选器「应用图表」里被勾掉（`tileTargets[tileUuid] === false`）          | 不属于作用范围，不隐藏                                            |
| 作者隐藏筛选器               | 筛选器 `hidden: true`（查看者看不到这个筛选器，但仍生效）                          | 照常按取值/候选隐藏                                               |
| 全局 / Tab 筛选栏关闭        | 合并筛选为空（`getMergedFiltersForTab` 返回空）                                    | 不隐藏（筛选器本身不再生效）                                      |
| 编辑模式                     | `isEditMode`                                                                       | 永不隐藏、不探测；配置处用「无值隐藏」角标提示哪些图会被隐藏      |

实现入口：`isFilterEmptyForTileVisibility`（`filterCandidateAvailability.ts`）。
作用范围判定与调度器「筛选器 →Tab 归属」共用 `doesFilterApplyToTile`
（`tileTargets` + 字段匹配，`tileVisibility.ts`）。

## 三、配置入口（作者侧）

- 位置：筛选器配置弹窗 → **「查看者限制」分区** → 开关 **「无值时隐藏关联图表」**。
  与「筛选器只读」「筛选器隐藏」同区，仅编辑模式可见，配置随看板保存。
- 作用范围：**只作用于「应用图表」里勾选的图**（`tileTargets` 绑定的 tile）。
  未配置过 `tileTargets`（auto）时按字段匹配自动作用于含该字段的图；
  只有在配置里把某张图勾掉（`false`）才排除它。
- 可见性提示：开启后，编辑模式对「查看态会被隐藏的图」显示 **「无值隐藏」角标**，
  hover tooltip 说明「查看模式下，该筛选器无值时会隐藏此图表」；
  「任何值」规则的角标依赖查看态探测结果（编辑模式不探测，作者从未在查看态
  跑过时可能无角标，属预期）。

前端入口在 `FilterSettings.tsx`（查看者限制分区）与 `DashboardTabs`（角标 +
提示条），字段随 `filterRule` 一起经 `onChangeFilterRule` 保存。

## 四、「任何值」候选探测

「任何值」(`disabled: true`) 的筛选器本身没有确认值，只能问数仓「这条链下还有没有
候选」来决定是否隐藏。要点：

- **needsCandidateProbe**：同时满足才会探测——
  1. 开启 `hideTilesWhenEmpty`；
  2. 当前是「任何值」(`disabled === true`)；
  3. 普通维度（类目筛选器不参与；SQL 列无法用 field/search 探测）；
  4. 值型算子，且排除 `IN_THE_CURRENT` / `NOT_IN_THE_CURRENT`（本身有语义）。
- **只探测、不写值**：`probeFilterCandidateAvailabilityAsync` 复用 field/search
  请求链路，但完全不动 `values` / `disabled`。
- **5s 缓存**：候选请求走既有 `FIELD_SEARCH_CACHE_TTL_MS = 5000` 的去重缓存，
  与筛选器下拉候选共用，同一签名 5 秒内不重复打仓库。
- **每个访问 Tab 每筛选器至多 1 次**：`reportCandidateAvailabilityAsync` 用
  `作用域:筛选器 id` 作去重键；全局筛选器在各 Tab 链上会按作用域分别上报一次，
  重复请求命中 5s 缓存。
- **pending 门禁**：类目/绑定值解析未完成（`isCategoryResolutionPending`）期间，
  `hiddenTileUuids` **保持上一次结果**，避免「先隐藏 → 解析完又显示」的闪烁和重复查询。
- **10s 兜底**：每个作用域独立的 `CATEGORY_RESOLUTION_MAX_WAIT_MS = 10000`
  兜底定时器，超时后放行图表查询并按当前探测结果校正；探测请求失败回调
  `unknown` → 不隐藏；会话被新操作取代时**不上报**（旧会话结果不得覆盖新会话
  已落地的 has/none）。
- 探测结果按作用域存放：`globalCandidateAvailability` + `tabCandidateAvailability`
  （Tab 覆盖全局，`mergeCandidateAvailability`）。

## 五、非「任何值」的运行时清空

绑定父级的普通维度筛选器（如「商品名称」绑定「品牌」）在父链断裂（父级无值）或
候选为空时：

- 开启了 `hideTilesWhenEmpty`：解析阶段**运行时清空** `values`（resolved 为空数组），
  让隐藏判定按「值型算子且值为空」隐藏作用图表；
- **不改作者默认**：清空只发生在本次查看会话的运行时解析里，不回写看板配置；
  未开开关的筛选器保持原语义（保留原值，宁可空图也不乱动）。

实现位置：`resolveBoundValuesAsync`（`categoryFilters.ts`）中
`clearValuesWhenEmpty` 分支。

## 六、性能约束

- **Provider 集中派生**：`hiddenTileUuids` 在 `DashboardProvider` 用 `useMemo`
  计算一次，`DashboardTabs`（tile 隐藏 + 提示条）与「全部图表已加载」判定
  （`areAllChartsLoaded`，供截图/导出）共用同一引用。
- **引用稳定**：无命中时返回共享常量 `EMPTY_TILE_VISIBILITY_SET`；内容不变时
  返回 `hiddenTileUuidsRef` 里的旧 Set，避免引用变化引发下游重渲染。
- **不做逐 tile 订阅**：每张 tile 不各自计算「我会不会被隐藏」，统一从 context
  取 `hiddenTileUuids.has(uuid)`。
- **批量状态更新**：候选可用性按作用域合并进单个 state（`applyCandidateAvailability`
  返回同引用时不 setState），隐藏集合一次 `useMemo` 出全量，不做逐 tile setState。
- **不做 debounce**：隐藏集合是同步派生态（输入变化即时重算），配合 pending 门禁
  与引用稳定即可，不需要防抖。

## 七、边界与本期不做

- **SQL 列不探测**：`target.isSqlColumn === true` 的筛选器 `needsCandidateProbe`
  为 false → 探测状态恒为 `unknown` → **任何值场景不隐藏**（无法可靠判定候选）。
  非任何值的空值隐藏不受影响（不依赖探测）。
- **类目筛选器不提供开关**：有 `categoryLevel` 的筛选器不展示该开关、也不探测
  （类目候选为空时已有「无类目可选」的既有表现）。
- **编辑模式不探测**：编辑模式从不隐藏 tile，也不发候选探测请求；仅用本地派生
  显示「会被隐藏」的角标提示。
- **逐图 CSV 导出本期不做**：单图下载/调度任务里不应用「无值隐藏」（图表照常
  生成）；本期只覆盖看板页查看态与看板截图/PDF 导出。
- **看板截图/PDF（Unfurl）健壮性**：所有图表被隐藏时页面没有 `.loading_chart_overlay`，
  `waitForAllLoaded()` 的 attached 等待改为 try/catch + 30s 超时容忍（保持
  Playwright 默认窗口，慢看板不会提前截图；忽略后继续），后续 `state: 'hidden'`
  等待不变（overlay 不存在时视为 hidden 立即通过），导出不再因「等不到 overlay」
  超时报错。代价是纯 Markdown / 全隐藏看板导出固定多等 30s。

## 八、验证清单

自动化覆盖（单测，见对应 `*.test.ts`）：

- `filterCandidateAvailability`：needsCandidateProbe 各条件组合、isFilterEmpty
  语义表逐行、合并作用域。
- `tileVisibility`：tileTargets false / mapped / auto、字段匹配、空集合引用稳定。
- `categoryFilters`（candidateProbe / boundValues 用例）：只探测不写值、链路断裂
  返回 none / 运行时清空、unknown 上报、作用域去重。

手工验收（查看模式 + 编辑模式各走一遍）：

1. 筛选器配置里能看到「查看者限制 → 无值时隐藏关联图表」开关，保存后刷新仍在。
2. 非任何值筛选器清空值 → 「应用图表」勾选的图整块消失，未勾选的图不受影响。
3. 筛选器填上任一值 → 被隐藏的图立刻恢复显示。
4. 任何值 + 父级类目无子级（候选为空）→ 作用图表被隐藏；有候选 → 不隐藏。
5. 探测接口人为制造失败/超时 → 图表**不**被隐藏（unknown 兜底）。
6. 首屏加载期间（类目解析 pending）不出现「图先显示 → 隐藏」的闪烁。
7. 编辑模式：被影响的 tile 显示 icon 角标，hover 有 tooltip；编辑模式本身不隐藏。
8. 筛选栏关闭（hidden 筛选器）+ 开关开启 → 查看态图表照常按无值隐藏。
9. 看板截图/PDF 导出：所有图被隐藏的看板仍能正常出图（不再等 overlay 超时）。
10. 切换 Tab：全局筛选器在各 Tab 的隐藏表现一致；Tab 覆盖探测结果正确生效。

## 九、关键代码位置

| 文件                                                                          | 内容                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/common/src/types/filter.ts`                                         | `DashboardFilterRule.hideTilesWhenEmpty` 字段                                                                                                    |
| `packages/frontend/src/utils/filterCandidateAvailability.ts`                  | `needsCandidateProbe` / `isFilterEmptyForTileVisibility` / `mergeCandidateAvailability`                                                          |
| `packages/frontend/src/utils/tileVisibility.ts`                               | `doesFilterApplyToTile` / `getTileUuidsHiddenByEmptyFilters`（含 `EMPTY_TILE_VISIBILITY_SET`）                                                   |
| `packages/frontend/src/utils/categoryFilters.ts`                              | 候选探测（`probeFilterCandidateAvailabilityAsync` / `reportCandidateAvailabilityAsync`）、5s 缓存、绑定值运行时清空（`resolveBoundValuesAsync`） |
| `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx`             | `hiddenTileUuids` 集中派生、pending 门禁、10s 兜底、候选可用性 state                                                                             |
| `packages/frontend/src/components/DashboardTabs/index.tsx`                    | tile 隐藏渲染、编辑模式角标、隐藏数量提示条                                                                                                      |
| `packages/backend/src/services/DashboardService/dashboardOperationLogDiff.ts` | `hideTilesWhenEmpty` 进入筛选器变更审计（dashboard filters updated 的 previous/next）                                                            |
| `packages/backend/src/services/UnfurlService/UnfurlService.ts`                | `waitForAllLoaded()` 对「无 overlay」的容忍（截图/PDF 导出）                                                                                     |
