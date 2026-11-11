# 看板 Tab 级日期可选范围约束（近 N 个月滚动窗口）

> 状态：**草案**（调研已完成，待产品确认 2 个语义问题后进入开发）
>
> 需求来源：新品数据库看板（多 tab）。底层各主题表数据可用窗口不同（有的近 24 个月、有的近 12 个月），但看板日期筛选器（「首订单时间 在之间」，月粒度）目前可任选任意年月，选超范围即出现「无可用数据」/ null。
>
> 期望：**每个 tab 各自拥有日期筛选器与可选时间范围；范围外的年月在月历中置灰、不可勾选**。

---

## 1. 调研结论（可行性）

**结论：可以实现，且本 fork 已具备约 80% 的基础设施，缺口小、无数据库迁移。**

本 fork 已有的能力（均已上线在 dev）：

| 能力 | 位置 | 说明 |
|---|---|---|
| Tab 级筛选器 | `DashboardTab.filters`（jsonb）、前端 `tabFilters: Record<tabUuid, DashboardFilters>` | 每个 tab 可建自己的筛选器集合，pill 只在所属 tab 显示；查询按 tab 合并（`mergeFiltersForTab`）后下发 |
| 筛选器日期约束（静态 min/max） | `DashboardFilterRule.minAllowedDate / maxAllowedDate`（`common/src/types/filter.ts:186-195`） | 配置入口 `FilterSettings` → `DateRangeConstraintEditor.tsx`；运行时经 `getDashboardFilterDatePickerBounds` 转成 Mantine picker 的 `minDate/maxDate`，**日历中范围外日期已置灰** |
| 动态最晚可选月（动态 max） | `enableDynamicMaxAllowedDate` + `getDynamicMaxAllowedDate`（`filterDateUtils.ts:125-152`） | 月粒度：4 号前 → 上上月末、4 号起 → 上月末；季度 → 上一完整季度末 |
| 保存期校验（唯一硬拦截） | `validateDashboardFilterDynamicDateRange`（`FilterConfiguration/utils/index.ts:44`） | 仅覆盖「动态区间默认值」，越界 toast 并阻止保存 |
| 跨 tab 同字段取值同步 | `syncSelectionToAllTabs`（`utils/userFilterSelections.ts:652`） | 用户在某 tab 改值会同步到其它 tab 的同字段规则 |

### 1.1 缺口（本需求需要补的）

| # | 缺口 | 影响 |
|---|---|---|
| G-A | **没有「动态 min」**：可选最早日期只能是固定日期，会随时间过期 | 「近 24 个月 / 近 12 个月」是滚动窗口，必须支持滚动下限 ← **本需求核心缺口** |
| G-B | 固定值不受约束：作者默认值、URL/embed 覆盖值、**跨 tab 同步值**越界时原样进查询 | tab A（24 个月窗口）选的值同步到 tab B（12 个月窗口）后会查到空数据，恰是要修的问题 |
| G-C | `applyDimensionOverrides` 未回填 `enableDynamicMaxAllowedDate / dateRangeGranularity`（`common/src/types/filter.ts:744-755`） | URL 覆盖路径会丢动态 max / 粒度元数据 |
| G-D | 保存期校验不覆盖固定值默认值 | 作者先设默认值后收紧约束时静默越界 |
| G-E | 后端无任何约束执行（仅 UI 契约）：API 直调、调度器路径可越界 | 需求只要求「不可勾选」，前端足够；后端为可选加固 |

另有两个**现状不对称**需要业务侧确认（非代码缺口）：

- SQL 图表 tile **不消费 tab 级筛选器**（只吃全局筛选器，`DashboardSqlChartTile.tsx:27`）。若新品数据库某 tab 用了 SQL 图表，tab 级日期筛选器对其无效。
- tab 级筛选器与全局筛选器同字段时会叠加为 AND 条件；配置新品数据库时应**删掉全局的「首订单时间」筛选器、各 tab 各建一个**，避免重复 pill 与条件叠加。

---

## 2. 方案设计

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

**配置 UI**（`DateRangeConstraintEditor.tsx` 最小值一侧）：

- SegmentedControl：`固定日期 | 近 N 个月`；选后者时渲染 NumberInput（1–120，默认 24），写入 `rollingMinAllowedMonths` 并清空 `minAllowedDate`；反向切回时清空 rolling 字段。

**运行时**（`DateFilterInputs.tsx` → 各月粒度 picker）：无需改动——bounds 计算出来后月历自然置灰，即满足「不让勾选」。

### 2.2 查询前按规则边界钳制（G-B）

`prepareDashboardFilterRuleForQuery` / `resolveDisplayValues`（`FilterInputs/utils.ts`）：

- 区间规则（IN_BETWEEN）**无论动态还是固定值**，都经 `clampDateRangeValuesToBounds` 夹到 `[minDate, maxDate]` 后再进查询与 chip 文案（现在只夹动态值）；
- 这样三处越界来源一次堵齐：作者过期默认值、URL/embed 注入、跨 tab 同步值。
- 同步路径兜底：`syncSelectionToAllTabs` 同值时接收方按自身边界钳制（与 picker 置灰语义一致：用户手动也选不出的值，同步也进不来）。

### 2.3 元数据保真与保存校验（G-C / G-D）

- `applyDimensionOverrides` 回填清单补 `enableDynamicMaxAllowedDate`、`dateRangeGranularity`、`rollingMinAllowedMonths`；
- 保存期校验扩展为覆盖固定值默认值（`validateDashboardFilterDynamicDateRange` → 更名/扩展为通用区间校验，越界即 toast 阻断）。

### 2.4 配套接线（无行为变更）

- `getFilterRuleRevertableObject`（`FilterConfiguration/utils/index.ts:251`）补新字段；
- `dashboardOperationEventQueue.ts` 的 `date_constraint` changeKind 映射补新字段（改约束触发一次取数属预期）；
- `dashboardOperationLogDiff`（backend）与 `dashboard-as-code-1.0.json` schema 补字段；跑 `pnpm generate-api`；
- i18n：`public/locales/{zh,en}/translation.json` 的 `components_dashboard_filter.configuration.date_range.*` 新增「近 N 个月」相关键。

### 2.5 明确不做（本期）

- 后端查询期校验/钳制（G-E）：需求是 UI 层「不可勾选」，前端已闭环；列为后续可选加固；
- 日/年粒度的滚动窗口、单值动态（EQUALS）钳制；
- SQL tile 消费 tab 筛选器（独立需求另行评估）。

---

## 3. 新品数据库看板的落地配置（零代码，配合本期功能）

1. 编辑模式下删除顶部的全局「首订单时间」筛选器；
2. 逐 tab 在**本 tab 内**新建日期筛选器「首订单时间」，操作符「在之间」、粒度「月」；
3. 约束设置：可选最早 = 近 N 个月（分布/热卖等近 24 个月 tab 设 24，仅近 12 个月数据的 tab 设 12）；可选最晚 = 开启「按数据更新限制」（4 号规则动态 max）；
4. 各 tab 默认值按业务需要设置（保存校验会拦截越界默认值）。

---

## 4. 实施拆分与工作量

| 阶段 | 内容 | 预估 |
|---|---|---|
| P1 | rollingMinAllowedMonths：类型 + bounds 解析 + 约束编辑器 UI + i18n + 单测（`filterDateUtils.test.ts` 等） | 1–1.5 天 |
| P2 | 查询前钳制 + 同步钳制 + `applyDimensionOverrides` 回填 + 保存校验扩展 + 单测 | 1 天 |
| P3 | 配套接线（as-code schema、operationLogDiff、generate-api、回滚对象/事件队列）+ 新品数据库看板逐 tab 配置与验收 | 0.5–1 天 |

**测试策略**（遵循聚焦测试纪律）：仅跑改动直接相关的单文件 vitest（`filterDateUtils.test.ts`、`FilterInputs/utils.test.ts`、`FilterConfiguration/utils/index.test.ts`、`mergeFiltersForTab.test.ts`、userFilterSelections 相关），全部带 `timeout`。

**兼容性**：新字段 optional、存量 JSON 数据无迁移；不配置 rolling 字段的看板行为与现状完全一致（bounds 逻辑短路与现在相同）。

---

## 5. 待确认的语义问题（开发前需拍板）

1. **「近 N 个月」窗口锚点**：建议 = 与「可选最晚月」耦合（可选的恰好是最近 N 个有数据的整月；4 号前数据未到的月份不占额度）。备选 = 与今天耦合（固定从「今-月 N-1」起算，4 号前窗口会短一个月）。
2. **SQL 图表 tile**：新品数据库各 tab 是否存在 SQL 图表？若有，tab 级筛选器对它们无效，需要单独决策（改造成本高）。
3. **跨 tab 同值同步**：保留（同步后按各 tab 边界钳制，推荐）还是关闭日期字段的同步（各 tab 完全独立）？

---

## 6. 风险

- 查询 key 含整条筛选器规则对象：作者改约束本身会触发一次取数（现状语义，不算新增风险）；
- 钳制固定值会改变「作者默认值越界」时的查询语义（从查空数据变为查夹紧后的最近合法区间）——这正是需求意图，但需在验收时与业务确认展示一致；
- `applyDimensionOverrides` 回填补字段属行为修复，URL 覆盖路径的看板需回归验证。
