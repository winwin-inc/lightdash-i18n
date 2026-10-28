# 看板筛选 / 首次加载性能排查（新品数据库 · 新品追踪 / 新品清单 · 标签清单）

> 排查范围：`feat/tab-filter-category-binding` 分支的看板（Dashboards）前端筛选链路 + 图表查询链路。
> 结论先行：**慢的主因不在浏览器渲染，而在「数仓往返次数」**。筛选器相关的前端还有若干
> 「重复查询 / 重复渲染」问题，已修掉一部分，剩余部分需要结合客户实例的数据再决定是否动。

---

## 1. 结论摘要

| #   | 结论                                                                                                                                       | 证据强度                                                               | 状态                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------ |
| 1   | 每个 chart tile 各自发一条 SQL 到数仓，首屏并发 N 条；数仓排队是首屏慢的最大嫌疑                                                           | 代码路径明确，需客户 `query_history` 佐证                              | 待客户数据确认           |
| 2   | 全局类目筛选器改动会触发**两轮** tile 查询：第一轮用「父级新值 + 子级旧值」（结果多半是空），级联解析完再第二轮                            | 代码路径明确（`DashboardProvider.tsx` 全局路径 vs Tab 路径行为不一致） | 已在报告中给出改法，未改 |
| 3   | 类目解析链（一级 → 四级）是**串行**的 field/search 往返，且首屏会**阻塞**图表查询（最多等 10s）                                            | 代码路径明确                                                           | 未改（见 §5.2）          |
| 4   | 表格 tile 每次筛选变化会额外发一条 count 查询（`calculate-count`），不受类目解析闸门约束                                                   | 代码路径明确                                                           | 未改（见 §5.4）          |
| 5   | 筛选下拉每次打开都会打数仓（DISTINCT 查询，limit 500），前端不缓存                                                                         | 代码路径明确                                                           | 建议开缓存（§5.1）       |
| 6   | 合并后的筛选器每次都是新对象 → 看板上下文变化时**所有 tile 重渲染**、过滤规则重算；叠加 `addResultsCacheTime` 的逐 tile 更新会放大成 O(N²) | 代码路径明确                                                           | ✅ 已修                  |
| 7   | `allFilterableFieldsMap` 用带对象展开的 `reduce` → O(n²) 对象拷贝                                                                          | 代码路径明确                                                           | ✅ 已修                  |

已提交的改动见 §4。

---

## 2. 相关代码路径

```
DashboardProvider (packages/frontend/src/providers/Dashboard/DashboardProvider.tsx)
├── useDashboardTabFilters (hooks/dashboard/useDashboardTabFilters.ts)   ← 全局/Tab 筛选器合并
├── runGlobalCategoryInit / runTabCategoryInit                          ← 类目解析（首屏）
├── updateDimensionDashboardFilter / updateTabDimensionFilter           ← 类目级联（手动改）
│     └── utils/categoryFilters.ts                                      ← field/search 串行链
├── useDashboardsAvailableFilters (hooks/dashboard/useDashboard.ts)     ← availableFilters
└── isCategoryResolutionPending → hooks/dashboard/useDashboardChartReadyQuery.ts (enabled 闸门)
      └── components/DashboardTiles/DashboardChartTile.tsx
            ├── useDashboardChartReadyQuery  → POST /projects/:uuid/query/dashboard-chart
            └── useCalculateCount            → POST /saved/:uuid/calculate-count
```

后端：

```
AsyncQueryService.executeAsyncDashboardChartQuery  → 每 tile 一条 warehouse query
ProjectService.searchFieldUniqueValues             → 筛选下拉 / 类目解析的 DISTINCT 查询
```

---

## 3. 耗时来源分解（按怀疑度排序）

### 3.1 每个 tile 一条 SQL，并发打数仓（首屏最大嫌疑）

- 每个 chart tile 通过 `useDashboardChartReadyQuery` 独立发
  `POST /projects/:uuid/query/dashboard-chart`
  （`packages/frontend/src/hooks/dashboard/useDashboardChartReadyQuery.ts:37`），
  后端 `AsyncQueryService.executeAsyncDashboardChartQuery`
  （`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:2442`）在请求内
  **同步**跑完 warehouse query 才返回。
- 看板有 N 个 tile → 首屏并发 N 条 SQL。新品追踪这类页面通常 tile 较多，
  数仓并发上限/队列会直接把首屏时间拉长。
- 结论：首屏慢**大概率是数仓侧**，不是前端。

**建议**：

- 客户侧看 `query_history`：统计首屏每张图的实际耗时与是否排队。
- 打开结果缓存（`RESULTS_CACHE_ENABLED=true` + S3 配置）：缓存 key = `projectUuid + sql + timezone`
  （`AsyncQueryService.ts:1881`），第二次打开同筛选条件的看板可直接命中。
- 长期：把重聚合下沉到 dbt 预聚合表 / pre-aggregation，减少 tile 各自的扫描量。

### 3.2 全局类目筛选器改动 → 两轮 tile 查询

`DashboardProvider.updateDimensionDashboardFilter`（`DashboardProvider.tsx:824`）：

1. `originalUpdateDimensionDashboardFilter(...)` → **立刻**写入 `dashboardFilters`
   → 所有 tile 的 query key 变化 → **第 1 轮 tile 查询**开始（此时子级类目还是旧值，
   结果多半为空）。
2. `updateGlobalCascadeWithFieldSearch(...)` → 串行 field/search 级联解析 →
   `setDashboardFilters(refinedGlobal)` → 子级值被纠正 → **第 2 轮 tile 查询**。

对比 **Tab 作用域**的同类逻辑（`DashboardProvider.tsx:1330` 附近）：它用
「乐观展示态」`tabCategoryDisplayFilters`，**先不写回** `tabFilters`，
级联解析完成后才一次性提交 → **只有一轮 tile 查询**。

> 也就是说：Tab 里的类目筛选器已经优化过，**全局筛选器还是旧行为**，
> 这是两条路径行为不一致的地方，也是「切换筛选器时慢」最直接的解释。

**建议改法**（未实施，风险中等）：把全局路径对齐 Tab 路径 ——
用户选中后只更新「展示态」，级联解析完成后再一次性写回 `dashboardFilters`，
让 tile 只查一次。需要注意保存/embed/URL 同步与 `processedSignature` 标记的交互。

### 3.3 类目解析链是串行的，且首屏会阻塞图表查询

- `initializeCategoryFiltersAsync`（`utils/categoryFilters.ts:1012`）按层级 `for` 循环
  `await`，每级一次 `POST /projects/:uuid/field/:fieldId/search`（数仓 DISTINCT 查询）。
  四级类目 = 4 次**串行**往返。
- 手动改父级时：`updateCrossScopeCategoryCascadeAsync`（`:1238`）按作用域串行，
  `cascadeChildrenAsync`（`:814`）再按层级串行 → 同样是 N 次串行往返。
- 首屏：解析完成前**不发**图表查询
  （`useDashboardChartReadyQuery.ts:359` 的 `enabled` 含 `!isCategoryResolutionPending`），
  超时 10s 后先放行、解析完再校正一次
  （`DashboardProvider.tsx:2741`、`CATEGORY_RESOLUTION_MAX_WAIT_MS`）。

> 结论：如果客户看板用了 3~4 级类目筛选器，**首屏会先串行跑 3~4 次数仓 DISTINCT 查询**，
> 然后才开始跑 tile 的业务 SQL —— 这是纯浪费的等待。

### 3.4 表格 tile 的 count 查询

`DashboardChartTile.tsx:322` 的 `useCalculateCount` 在「开启分页」或「表格显示总行数」时启用，
每次筛选变化都会**额外发一条** `POST /saved/:uuid/calculate-count`（又一次数仓查询）。
它没有挂在类目解析闸门上，所以第 1 轮（子级旧值）也会打一次，属于纯浪费。

### 3.5 筛选下拉每次打开都打数仓

- `FilterStringAutoComplete.tsx:133` → `useFieldValues(..., { refetchOnMount: 'always' })`
  → `POST /projects/:uuid/field/:fieldId/search`，`limit = MAX_SELECT_ALL_LIMIT = 500`
  （`hooks/useFieldValues.ts:26`）。
- 后端 `ProjectService.searchFieldUniqueValues`（`ProjectService.ts:3787`）会编译并执行
  `SELECT DISTINCT <field> ... WHERE <左邻筛选>`，大表上不便宜。
- 该接口支持 S3 缓存（`cache_autocomplete.` 前缀），但**默认关闭**：
  `AUTOCOMPLETE_CACHE_ENABLED === 'true'`（`packages/backend/src/config/parseConfig.ts:2061`）。

### 3.6 前端渲染 / 表格计算

- 表格/透视表渲染已有专项优化，见 `docs/table-scroll-performance.md`。
- **表格计算（table calculation）、SQL runner、模板渲染都在后端 query compiler 里完成**
  （`packages/backend/src/queryCompiler.ts`），浏览器不参与求值 —— 所以「表格计算慢」基本等价于
  「那条 SQL 在数仓跑得慢」。
- 前端唯一可疑点：筛选结果对象引用不稳定 → 所有 tile 重渲染 + 过滤规则重算（O(规则数 × 字段数)）。
  已修（§4.1/§4.2）。
  注意：React Query 的 query key 是**内容哈希**，所以引用抖动**不会**造成重复发请求，
  只会造成多余渲染与 CPU 开销。

### 3.7 availableFilters 一次算全量

`useDashboardsAvailableFilters`（`hooks/dashboard/useDashboard.ts:109`）把**整块看板**
（含其他 Tab）的 chart uuid 一次性发给后端算可筛选字段（`DashboardProvider.tsx:1933`）。
不是数仓查询，但看板越大越慢。

> **注意：这里不能按 Tab 收敛。** 全局筛选器需要作用于所有 Tab 的图表，
> 后端必须拿到全量 chart 才能算出全局可筛选字段；
> 只传当前 Tab 会让全局筛选器在其它 Tab 上缺少可筛选字段。

---

## 4. 本次已提交的改动

### 4.1 `getMergedFiltersForTab` 按 Tab 缓存引用

文件：`packages/frontend/src/hooks/dashboard/useDashboardTabFilters.ts`

tile 通过 `useDashboardContext((c) => c.getMergedFiltersForTab(uuid))` 订阅该值。
原实现每次调用都 `mergeFiltersForTab(...)` 返回**新对象** → `useContextSelector` 判定值变了
→ 看板上下文的任意变化都会让**所有 tile 重渲染**，并触发 tile 侧过滤规则重算、query key 重算。

**放大机制（O(N²)）**：`DashboardChartTile.tsx:272` 在查询完成后调用
`addResultsCacheTime(cacheMetadata)`（`DashboardProvider.tsx:2627`），
每次都 `setResultsCacheTimes([...old, ...])` → Provider 状态更新 → Provider 重渲染 →
context value 重建 → 所有 tile 的 selector 重跑。
在原实现里 selector 返回的是**新对象**（`Object.is` 不成立）→ N 个 tile 全部重渲染；
每个 tile 完成一次查询就触发一轮 → N 个 tile ≈ **N² 次 tile 重渲染 + 过滤规则重算**
（每次重算的代价是 O(规则数 × 字段数)）。
改成稳定引用后，selector 的 `Object.is` 成立 → 这条链路不再触发 tile 重渲染。

> 注：`addResultsCacheTime` 只在**结果缓存命中**时才写入状态，所以这条 O(N²) 路径
> 目前只在开启 `RESULTS_CACHE_ENABLED` 的实例上出现；而 §5.1 恰恰建议开启该缓存 ——
> 本次修复正好把这个副作用消掉了。

改动：按 Tab 缓存合并结果，仅当输入（全局筛选器 / 临时筛选器 / Tab 筛选器 / 两层开关）变化时重算。

### 4.2 `getDisplayedMergedFiltersForTab` 按 Tab 缓存引用

文件：`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx`

顶部筛选栏用的合并结果同样每次返回新对象，导致筛选栏整块重渲染。改为同样的按 Tab 缓存。

### 4.3 `allFilterableFieldsMap` 从 O(n²) 降为 O(n)

文件：`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx`

```diff
- ? dashboardAvailableFiltersData.allFilterableFields.reduce<Record<string, DashboardFilterableField>>(
-       (sum, field) => ({ ...sum, [getItemId(field)]: field }), {})
+ const map: Record<string, DashboardFilterableField> = {};
+ fields.forEach((field) => { map[getItemId(field)] = field; });
```

原来每累积一个字段就整体拷贝一次对象（n 个字段 → n 次全量拷贝）。

### 4.4 新增单测

文件：`packages/frontend/src/hooks/dashboard/useDashboardTabFilters.test.ts`

覆盖：相同输入返回同一引用；全局筛选器变化 / Tab 筛选器变化 / 开关变化后引用失效并重算；
不同 Tab 各自独立。

---

## 4bis. 「切多 Tab 慢」的根因与优化（第二轮）

客户反馈的第二个场景：**在一块多 Tab 看板上反复切 Tab 很慢**。

### 4bis.1 根因一：所有 Tab 的 tile 都挂载且都发查询

- `components/DashboardTabs/index.tsx` 对**每个 Tab** 都渲染 `TabGridPanel`，
  非激活 Tab 只是 `contentVisibility: hidden`（隐藏，不是卸载）；
- `hooks/dashboard/useDashboardChartReadyQuery.ts` 的 `enabled` 原来只判断
  `chartUuid / dashboardUuid / chart / explore / 类目闸门`，**没有判断 tile 是否属于当前 Tab**；

结果：打开一块 N 个 Tab、每个 Tab M 个 tile 的看板，首屏一次性打出 **N × M** 条数仓查询。
这些查询在数仓侧排队，用户在任何一个 Tab 上都要等“别人占着资源”。
切 Tab 本身不发新请求（query key 不含 activeTab），但用户切过去后看到的仍是排队中的图。

### 4bis.2 根因二：类目闸门是全局的，切 Tab 会拖累其它 Tab

`DashboardProvider` 的 `isCategoryResolutionPending` =
「全局类目在解析」 **或**「当前 activeTab 的类目在解析」。
切到某个 Tab 会触发它的类目解析（`runTabCategoryInit`）→ pending 置为 true
→ **整块看板的所有 tile 查询都被禁用**（含其它 Tab）。
后果：在解析期间修改全局筛选器，受影响的 Tab 不会重新查询，图不刷新。

### 4bis.3 优化一：只有访问过的 Tab 才发起查询

- `DashboardProvider` 新增 `visitedTabUuids`（只增不减，引用稳定）；
- 新增 `utils/dashboardTabs.ts`：
  - `resolveEffectiveTabUuid(tileTabUuid, dashboardTabs)`：解析 tile 实际所属 Tab
    （与 `DashboardTabs.tilesByTab` 的 fallback 一致：Tab 列表尚未加载时，
    tile 带 `tabUuid` 不能当成「无 Tab 看板」放行，否则首屏风暴依旧）；
  - `shouldQueryTileForTab(effectiveTabUuid, visitedTabUuids)`：无 Tab 作用域 → 放行。
- `useDashboardChartReadyQuery` 与 `DashboardChartTile` 的 count 查询
  的 `enabled` 都加上这个判断。

效果：3 个 Tab × 5 个 tile 的看板，首屏从 **15 条降到 5 条**；
未访问过的 Tab 不会占用数仓资源；切到新 Tab 时该 Tab 才发起查询（React Query
在 `enabled` 由 false 变 true 时会 fetch，命中不了缓存的情况才真的打数仓）。

### 4bis.4 优化二：类目闸门按 Tab 隔离

- Provider 暴露 `isGlobalCategoryResolutionPending` 与 `pendingTabCategoryResolutions`；
- tile 的闸门改成：全局在解析 **或 自己的 Tab 在解析** 才挡住；
- 其它 Tab 的类目解析不再阻塞本 Tab 的查询与刷新。

### 4bis.5 优化三：count 查询与图表查询对齐

表格的 `calculate-count` 查询此前不看 Tab、也不受类目闸门约束，
现在与图表查询使用同一套条件（Tab 可见 + 类目已解析完）。

### 4bis.6 新增单测

文件：`packages/frontend/src/utils/dashboardTabs.test.ts`（7 个用例）
覆盖：Tab 归属解析（含脏数据 fallback、Tab 列表未加载）、访问判定。

---

## 5. 建议的后续优化（按性价比排序）

### 5.1 打开后端缓存（零代码，改环境变量）

```bash
AUTOCOMPLETE_CACHE_ENABLED=true   # 筛选下拉 / 类目解析的 DISTINCT 结果缓存（S3）
RESULTS_CACHE_ENABLED=true        # 图表结果缓存（S3），key = project + sql + timezone
```

- 依赖 S3（或兼容 S3 的对象存储）配置；
- 自动补全缓存按 SQL 文本 hash，筛选条件变了就是新 key；
- 结果缓存对「同一批筛选条件重复打开看板」收益最大（客户每天看同一个看板 → 首屏直接命中）。

### 5.2 类目解析链并行化（收益大，需同步改测试）

首屏解析时，每级的查询条件在链上已经确定（父级当前值已知），
可以先把各级 `field/search` **并发**发出去，解析时命中内存缓存
（`fetchFieldSearchValues` 已按「项目 + 字段 + 条件」缓存 promise，并发相同请求只打一次数仓）。

> 注意：现有测试 `packages/frontend/src/utils/categoryFilters*.test.ts` 用
> `mockResolvedValueOnce` 严格依赖请求顺序，实现前需要先把 mock 改成「按请求体条件返回」，
> 否则会被请求顺序变化打挂。

### 5.3 全局类目筛选器对齐 Tab 路径（消除第 1 轮无效 tile 查询）

见 §3.2。收益：切换全局类目时 tile 查询从 2 轮降到 1 轮，数仓负载减半，
且不会出现「先空后有」的闪烁。

### 5.4 count 查询挂到同一个闸门

`useCalculateCount` 的 `enabled` 加上 `!isCategoryResolutionPending`，
避免第 1 轮（子级旧值）多打一次 count。

### 5.5 ~~availableFilters 按当前 Tab 收敛~~（已作废）

**不能这么做**：全局筛选器要能作用于所有 Tab 的图表，后端 `getAvailableFiltersForSavedQueries`
必须拿到全量 chart 才能算出全局可筛选字段；只传当前 Tab 会让全局筛选器在其它 Tab 上缺少字段。

真正可做的是**后端按 Tab 分组缓存**（同一块看板的可用字段不随筛选变化，可复用）。

### 5.6 表格侧

已有 `docs/table-scroll-performance.md` 的优化；如仍慢，优先看
「表格行数 × 列数」与条件格式列数量，必要时在 dbt 侧预聚合。

---

## 6. 客户侧定位步骤（建议按顺序做）

1. **数仓侧确认**：查 `query_history`，看首屏每个 tile 的
   `created_at → completed_at` 耗时；确认是否存在排队（并发上限）。
   ```sql
   SELECT created_at, completed_at, warehouse_execution_time_ms,
          chart_uuid, context
   FROM query_history
   WHERE project_uuid = '<PROJECT_UUID>'
     AND created_at > now() - interval '1 day'
   ORDER BY created_at DESC
   LIMIT 100;
   ```
2. **确认是否有类目筛选器**：看板配置里是否有 1~4 级类目筛选器；
   有的话检查 `field/search` 的请求数是否 = 级数（串行）。
3. **浏览器 Network 面板**：
   - 首屏 `POST /projects/:uuid/query/dashboard-chart` 的**条数**与**并发情况**；
   - 是否出现同一批 tile 的**两轮**请求（全局类目改动场景）；
   - `POST /projects/:uuid/field/:fieldId/search` 的次数与耗时；
   - `POST /saved/:uuid/calculate-count` 的条数。
4. **前端渲染**：Chrome Performance 录制首屏，看长任务是否落在
   `mergeFiltersForTab` / `useDashboardFiltersForTile`（本次已优化），
   还是落在表格渲染。

---

## 7. 验证情况

- `pnpm -F frontend typecheck`：通过。
- `npx vitest run`（筛选相关用例）：
  `src/utils/categoryFilters.test.ts`、`src/utils/categoryFiltersCrossScope.test.ts`、
  `src/utils/categoryFilterInitHelpers.test.ts`、`src/hooks/dashboard/mergeFiltersForTab.test.ts`、
  `src/hooks/dashboard/useDashboardFilters.test.ts` → **70 passed**。
- 新增 `src/hooks/dashboard/useDashboardTabFilters.test.ts` → **5 passed**。
- ESLint 全量执行在本机因 Node 堆内存不足（OOM）失败，非已确认的 lint 错误；
  Prettier 检查：本次新增/修改文件全部通过。

仍需在客户实例上用 §6 的步骤复测，确认瓶颈归属。
