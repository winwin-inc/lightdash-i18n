# 看板 Tab 级日期可选范围约束（近 N 个月滚动窗口）

> 状态：**草案**（调研已完成，待产品确认 2 个语义问题后进入开发）
>
> 需求来源：新品数据库看板（多 tab）。底层各主题表数据可用窗口不同（有的近 24 个月、有的近 12 个月），但看板日期筛选器（「首订单时间 在之间」，月粒度）目前可任选任意年月，选超范围即出现「无可用数据」/ null。
>
> 期望：**每个 tab 各自拥有日期筛选器与可选时间范围；范围外的年月在月历中置灰、不可勾选**。
>
> 补充痛点（二期反馈）：新品分布页有同比指标，超 24 个月肯定无数据。即便设置了最早开始时间（静态），随数据窗口逐月前移，**约束和默认值都需要每月人工改**；期望「最早开始时间设置一次后，下个月自动往后移 1 个月」。

---

## 1. 调研结论（可行性）

**结论：可以实现，且本 fork 已具备约 80% 的基础设施，缺口小、无数据库迁移。**

本 fork 已有的能力（均已上线在 dev）：

| 能力 | 位置 | 说明 |
|---|---|---|
| Tab 级筛选器 | `DashboardTab.filters`（jsonb）、前端 `tabFilters: Record<tabUuid, DashboardFilters>` | 每个 tab 可建自己的筛选器集合，pill 只在所属 tab 显示；查询按 tab 合并（`mergeFiltersForTab`）后下发 |
| 筛选器日期约束（静态 min/max） | `DashboardFilterRule.minAllowedDate / maxAllowedDate`（`common/src/types/filter.ts:186-195`） | 配置入口 `FilterSettings` → `DateRangeConstraintEditor.tsx`；运行时经 `getDashboardFilterDatePickerBounds` 转成 Mantine picker 的 `minDate/maxDate`，**日历中范围外日期已置灰** |
| 动态最晚可选月（动态 max） | `enableDynamicMaxAllowedDate` + `getDynamicMaxAllowedDate`（`filterDateUtils.ts:125-152`） | 月粒度：4 号前 → 上上月末、4 号起 → 上月末；季度 → 上一完整季度末 |
| **动态区间默认值（默认值自动滚动）** | `settings.dateRange.mode='dynamic'` + `start/end`（direction/count/unit，`common/src/types/filter.ts:236-299`） | 默认值用「距今 N 个月」描述，展示/查询时按当前日期重新解析；前端 `prepareDashboardFilterRuleForQuery` 查询前解析，**后端编译器同样解析动态区间**（`filtersCompiler.ts` inBetween 动态分支）→ 定时推送等无前端场景也生效 |
| 保存期校验（唯一硬拦截） | `validateDashboardFilterDynamicDateRange`（`FilterConfiguration/utils/index.ts:44`） | 仅覆盖「动态区间默认值」，越界 toast 并阻止保存 |
| 跨 tab 同字段取值同步 | `syncSelectionToAllTabs`（`utils/userFilterSelections.ts:652`） | 用户在某 tab 改值会同步到其它 tab 的同字段规则 |

### 1.1 缺口（本需求需要补的）

| # | 缺口 | 影响 |
|---|---|---|
| G-A | **没有「动态 min」**：可选最早日期只能是固定日期，会随时间过期（对称的动态 max 已有） | 「近 24 个月 / 近 12 个月」是滚动窗口，必须支持滚动下限 ← **本需求核心缺口**；注意：**默认值**层面的逐月滚动已由动态区间默认值覆盖（§1.2），缺的只是**约束下限**的滚动 |
| G-B | 固定值不受约束：作者默认值、URL/embed 覆盖值、**跨 tab 同步值**越界时原样进查询 | tab A（24 个月窗口）选的值同步到 tab B（12 个月窗口）后会查到空数据，恰是要修的问题 |
| G-C | `applyDimensionOverrides` 未回填 `enableDynamicMaxAllowedDate / dateRangeGranularity`（`common/src/types/filter.ts:744-755`） | URL 覆盖路径会丢动态 max / 粒度元数据 |
| G-D | 保存期校验不覆盖固定值默认值 | 作者先设默认值后收紧约束时静默越界 |
| G-E | 后端无任何约束执行（仅 UI 契约）：API 直调、调度器路径可越界 | 需求只要求「不可勾选」，前端足够；后端为可选加固 |

另有两个**现状不对称**需要业务侧确认（非代码缺口）：

- SQL 图表 tile **不消费 tab 级筛选器**（只吃全局筛选器，`DashboardSqlChartTile.tsx:27`）。若新品数据库某 tab 用了 SQL 图表，tab 级日期筛选器对其无效。
- tab 级筛选器与全局筛选器同字段时会叠加为 AND 条件；配置新品数据库时应**删掉全局的「首订单时间」筛选器、各 tab 各建一个**，避免重复 pill 与条件叠加。

---

## 2. 方案设计

### 2.0 直接回答：能否「设置一次，每月自动后移 1 个月」

| 要滚动的东西 | 结论 |
|---|---|
| 最晚可选月 | ✅ 已有（`enableDynamicMaxAllowedDate`，含 4 号数据可用规则），零开发 |
| 筛选默认值（用户实际选中的区间） | ✅ 已有（动态区间默认值），**零开发、纯配置**：默认值设为「距今 23 个月 至 距今 1 个月」+ 粒度月，之后每月自动 +1；后端编译也解析，定时推送同样自动滚动 |
| 最早可选月（约束下限） | ❌ 需开发（本方案 §2.1，`rollingMinAllowedMonths`）——实现模式完全对称照抄 `getDynamicMaxAllowedDate`，属低成本增量 |

三者配齐后的效果：**一次配置 = 可选窗口永久钉在「最近 N 个有数据的整月」，约束下限、最晚上限、默认值三者每月同步自动滑动，无需任何人工维护**。

### 2.1 新增「滚动近 N 个月」下限（G-A，核心）

**类型**（`packages/common/src/types/filter.ts`，`DashboardFilterRule`）：

```ts
/**
 * 月粒度区间筛选器的滚动可选下限：min = 可选最晚月往前数 N 个整月的月初。
 * undefined = 不启用（退回固定 minAllowedDate）。
 */
rollingMinAllowedMonths?: number;
```

**解析**（`filterDateUtils.ts` 的 `getDashboardFilterDatePickerBounds`）：

- `rollingMinAllowedMonths = N` 时，`minDate = startOf(month(已解析 max).subtract(N-1, 'month'))`：
  - 与**已解析的 max**（固定 max 或动态 max）耦合，保证可选窗口恰好是「最近 N 个有数据的整月」，且不受 4 号数据延迟规则造成的 N±1 抖动；
  - max 无法解析（未配置且未开动态 max）时退化为 `startOf(now.subtract(N, 'month'))`；
- 与固定 `minAllowedDate` 取**更晚者**（已有 `mergeMinDate` 工具）。

**「每月自动 +1」示例**（N=24，今天 2026-11-11，4 号已过 → max=2026-10 月末）：

- 本月（11 月）可选窗口：`2024-11 至 2026-10`（24 个整月）
- 12 月 1–3 号（上月数据未到）：max 仍为 2026-10 末 → 窗口不变（`2024-11 至 2026-10`）
- 12 月 4 号起（11 月数据到达）：max=2026-11 末 → 窗口自动滑动为 `2024-12 至 2026-11`

即：min 每月随数据窗口自动 +1 个月，且窗口起点只在每月 4 号这一口径上变化，与数据到达节奏对齐，不会出现月中窗口漂移。

**配置 UI**（`DateRangeConstraintEditor.tsx`，月粒度示例）：

```
日期选择器  [月 ▾]
────────────────────────────────────────────
最早可选 ⓘ   [ 固定日期 | 近N个月 ]        ← SegmentedControl
  固定: [2024年10月 ▾]   近N: [ 24 ] 个月  （动态）
最晚可选 ⓘ   [ 2026年10月 ▾ ]              ← 开动态后变为 Badge
  ☐ 跟随数据更新 ⓘ
```

- **内联长文案全部移除**：删掉现有 `hint`（留空说明）与 `dynamic_max_description`（4 号规则）两段 Text；
- **改为图标 + Tooltip**：`min_label`/`max_label`/开关 label 旁各加一个 `IconInfoCircle`（Mantine `Tooltip`，withArrow，hover+focus 触发，键盘可达）：
  - 最早可选 ⓘ：「留空 = 不限制；选「近 N 个月」= 每月随数据窗口自动后移 1 个月，无需人工改」
  - 最晚可选/开关 ⓘ：「月粒度 4 号前可选到上上月、4 号及以后可选到上月；季度为最近一个完整季度。留空且未开启 = 不限制」
- **动态状态可视化**（回答「如何标记是动态的」）：约束处于动态时，对应输入框旁显示蓝色 `Badge`（size=xs，variant=light）并附解析后的当前值，如「动态 · 当前=2026-10」；固定日期时不显示 Badge，picker 可编辑。动态 min（近 N 个月）与动态 max 同样式，用户一眼分辦哪些维度在自动滚动；
- 选「近 N 个月」时写入 `rollingMinAllowedMonths` 并清空 `minAllowedDate`；反向切回时清空 rolling 字段；
- **无需单独开关**：模式选择器本身承载开关语义（`undefined` = 关、切回固定 = 关）；与 max 侧 Switch 的差异原因——动态 max 无参数，滚动 min 需要配 N，避免「开关+数字」双控件冗余；
- **出现条件与默认值**：仅月粒度 + 在之间的日期筛选器显示该模式选择器（与动态 max 开关出现条件对齐）；不配置时行为与现状完全一致，存量看板零影响。

**运行时**（`DateFilterInputs.tsx` → 各月粒度 picker）：无需改动——bounds 计算出来后月历自然置灰，即满足「不让勾选」。

### 2.2 默认值免维护（零开发，纯配置）

「每月人工改默认值」用已有动态区间默认值消除：各 tab 筛选器默认值切到「动态日期」模式，设为距今 23 个月 ～ 距今 1 个月（粒度月对齐到月初/月末）。展示 chip、查询参数、定时推送均逐月自动滚动；若默认值与约束窗口出现瞬时偏差，由 §2.3 的钳制兑底。

### 2.3 查询前按规则边界钳制（G-B）

`prepareDashboardFilterRuleForQuery` / `resolveDisplayValues`（`FilterInputs/utils.ts`）：

- 区间规则（IN_BETWEEN）**无论动态还是固定值**，都经 `clampDateRangeValuesToBounds` 夹到 `[minDate, maxDate]` 后再进查询与 chip 文案（现在只夹动态值）；
- 这样三处越界来源一次堵齐：作者过期默认值、URL/embed 注入、跨 tab 同步值。
- 同步路径兜底：`syncSelectionToAllTabs` 同值时接收方按自身边界钳制（与 picker 置灰语义一致：用户手动也选不出的值，同步也进不来）。

### 2.4 元数据保真与保存校验（G-C / G-D）

- `applyDimensionOverrides` 回填清单补 `enableDynamicMaxAllowedDate`、`dateRangeGranularity`、`rollingMinAllowedMonths`；
- 保存期校验扩展为覆盖固定值默认值（`validateDashboardFilterDynamicDateRange` → 更名/扩展为通用区间校验，越界即 toast 阻断）。

### 2.5 配套接线（无行为变更）

- `getFilterRuleRevertableObject`（`FilterConfiguration/utils/index.ts:251`）补新字段；
- i18n：`public/locales/{zh,en}/translation.json` 的 `components_dashboard_filter.configuration.date_range.*`——新增 tooltip 键（`min_tooltip` / `max_tooltip`）、Badge 键（`dynamic_badge`「动态」/ `dynamic_badge_current`「动态 · 当前={value}」）、模式键（`rolling_mode_label`「近 N 个月」/ `fixed_mode_label`「固定日期」）；原 `hint` / `dynamic_max_description` 长文案键废弃；
- `dashboardOperationEventQueue.ts` 的 `date_constraint` changeKind 映射补新字段（改约束触发一次取数属预期）；
- `dashboardOperationLogDiff`（backend）与 `dashboard-as-code-1.0.json` schema 补字段；跑 `pnpm generate-api`；

### 2.6 明确不做（本期）

- 后端查询期校验/钳制（G-E）：需求是 UI 层「不可勾选」，前端已闭环；列为后续可选加固；
- 日/年粒度的滚动窗口、单值动态（EQUALS）钳制；
- SQL tile 消费 tab 筛选器（独立需求另行评估）。

---

## 3. 新品数据库看板的落地配置（零代码，配合本期功能）

1. 编辑模式下删除顶部的全局「首订单时间」筛选器；
2. 逐 tab 在**本 tab 内**新建日期筛选器「首订单时间」，操作符「在之间」、粒度「月」；
3. 约束设置：可选最早 = 近 N 个月（分布/热卖等近 24 个月 tab 设 24，仅近 12 个月数据的 tab 设 12）；可选最晚 = 开启「按数据更新限制」（4 号规则动态 max）；
4. 默认值切到「动态日期」模式：距今 23 个月 ～ 距今 1 个月（粒度月对齐），逐月自动滚动免维护（仅近 12 个月的 tab 设距今 11 ～ 1）；保存校验会拦截越界默认值。

---

## 4. 实施拆分与工作量

| 阶段 | 内容 | 预估 |
|---|---|---|
| P1 | rollingMinAllowedMonths：类型 + bounds 解析（对称照抄动态 max）+ 约束编辑器 UI + i18n + 单测（`filterDateUtils.test.ts` 等）；**默认值动态滚动为纯配置，不在开发范围** | 1–1.5 天 |
| P2 | 查询前钳制 + 同步钳制 + `applyDimensionOverrides` 回填 + 保存校验扩展 + 单测 | 1 天 |
| P3 | 配套接线（as-code schema、operationLogDiff、generate-api、回滚对象/事件队列）+ 新品数据库看板逐 tab 配置与验收 | 0.5–1 天 |

**测试策略**（遵循聚焦测试纪律）：仅跑改动直接相关的单文件 vitest（`filterDateUtils.test.ts`、`FilterInputs/utils.test.ts`、`FilterConfiguration/utils/index.test.ts`、`mergeFiltersForTab.test.ts`、userFilterSelections 相关），全部带 `timeout`。

**兼容性**：新字段 optional、存量 JSON 数据无迁移；不配置 rolling 字段的看板行为与现状完全一致（bounds 逻辑短路与现在相同）。

---

## 5. 待确认的语义问题（开发前需拍板）

1. **「近 N 个月」窗口锚点**：建议 = 与「可选最晚月」耦合（可选的恰好是最近 N 个有数据的整月；4 号前数据未到的月份不占额度），备选 = 与今天耦合。✅ 已按「与最晚月耦合」写入 §2.1，如有异议请提出。
2. **SQL 图表 tile**：新品数据库各 tab 是否存在 SQL 图表？若有，tab 级筛选器对它们无效，需要单独决策（改造成本高）。
3. **跨 tab 同值同步**：保留（同步后按各 tab 边界钳制，推荐）还是关闭日期字段的同步（各 tab 完全独立）？

---

## 6. 同比指标的注意点

新品分布含同比：筛选窗口钉在 24 个整月时，窗口**前 12 个月**的同比对比对象在窗口之外 → 同比值必然为 null。这是数据本身只有 24 个月造成的（把窗口放大也一样），不是筛选器缺陷。若业务希望「同比列尽量不空」，可把默认值设为「距今 11 个月 至 距今 1 个月」（近 12 个月，同比完整），同时允许查看者在 24 个月窗口内自行调整。

## 7. 风险

- 查询 key 含整条筛选器规则对象：作者改约束本身会触发一次取数（现状语义，不算新增风险）；
- 钳制固定值会改变「作者默认值越界」时的查询语义（从查空数据变为查夹紧后的最近合法区间）——这正是需求意图，但需在验收时与业务确认展示一致；
- `applyDimensionOverrides` 回填补字段属行为修复，URL 覆盖路径的看板需回归验证。
