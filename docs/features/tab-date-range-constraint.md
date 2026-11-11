# 看板 Tab 级日期可选范围约束（近 N 个月滚动窗口）

> 状态：**草案 v3**（多 agent 评审后修订；待 §6 决策项拍板后进入开发）
>
> 需求来源：新品数据库看板（多 tab）。各主题表数据可用窗口不同（近 24 / 近 12 个月），筛选器「首订单时间 在之间」（月粒度）可任选年月，超范围即「无可用数据」。
>
> 期望：各 tab 拥有独立日期筛选器与可选窗口；范围外年月置灰；**约束与默认值设置一次后逐月自动滚动，免人工维护**。
>
> 评审记录：`.review/design-review-v2.md`（设计评审，deepseek reviewer）、`.review/ui-feasibility.md`（UI 可行性）、`.review/edge-cases.md`（40 条边界扫描）。三份评审一致结论：**方向可行、单一开关设计成立**，但存在下述 P0/P1 修正项，吸收后方可开工。

---

## 1. 已核实的基础设施（dev 分支现状）

| 能力 | 位置 | 说明 |
|---|---|---|
| Tab 级筛选器 | `DashboardTab.filters`；前端 `mergeFiltersForTab`（`useDashboardTabFilters.ts`） | 各 tab 独立筛选器集合，pill 只在所属 tab 显示 |
| 静态约束 min/max | `DashboardFilterRule.minAllowedDate/maxAllowedDate`（`common/src/types/filter.ts:186-194`） | 月历范围外置灰已生效；`DateRangeConstraintEditor` 配置入口 |
| 动态最晚月 | `enableDynamicMaxAllowedDate` + `getDynamicMaxAllowedDate`（`filterDateUtils.ts:125-144`） | 月：4 号前→上上月末、4 号起→上月末；季：上一完整季末；**日/年返回 undefined** |
| 动态区间默认值 | `settings.dateRange.mode='dynamic'`（`filter.ts:236-305`） | 默认值逐月自动滚动；前端 `prepareDashboardFilterRuleForQuery` 解析，**后端编译器也解析（仅全局筛选器路径，见 P0-1）** |
| 保存期校验 | `validateDashboardFilterDynamicDateRange`（`FilterConfiguration/utils/index.ts:50-95`） | 仅动态区间默认值；口径 `applyDataAvailabilityDelay=false`（与运行时 `=true` 不一致，见 P1-5） |
| 跨 tab 同步 | `syncSelectionToAllTabs`（`DashboardProvider.tsx:988` → `userFilterSelections.ts`） | ⚠️ 接收方会经 `stripDynamicDateSettings` **剥掉动态默认**（P1-6） |

---

## 2. P0 修正（评审发现，改变原方案两处结论）

### P0-1 定时交付（CSV/XLSX）不消费 tab 筛选器

`SchedulerTask.ts:495-505` 只取 `dashboard.filters`（全局），后端无 `mergeFiltersForTab` 等价逻辑；`selectedTabs` 只决定导出哪些 tile。图片交付走前端渲染（可能带 tab 筛选器），CSV 走后端（不带）→ **两者行为还不一致**。

影响：原方案 §3「删掉全局筛选器、各 tab 各建」会让**定时 CSV 完全失去日期过滤**（不是窗口不滚，是条件消失）；SQL tile 同理只吃全局。

**处置（D1，产品三选一）**：
- a. 保留一条全局日期筛选器专供定时交付（明确它不承担逐 tab 窗口职责，CSV 与页面窗口可能不同）；
- b. 后端按 tile.tabUuid 合并 tab 筛选器（正确但改动大，需新增后端切片与测试）；
- c. 明确本期只做查看端 UI 约束，接受定时 CSV 不受约束。

### P0-2 覆盖路径会丢 `settings`（动态默认值）——回填清单必须补全

`applyDimensionOverrides`（`filter.ts:736-757`）只回填 `minAllowedDate/maxAllowedDate`；`settings`（dateRange/singleDate）、`enableDynamicMaxAllowedDate`、`dateRangeGranularity`、新增 rolling 全部丢失。URL/embed/SDK/带 schedulerFilters 的定时任务只传 values 时，动态默认退化为保存时的固定值，「零开发免维护」在覆盖路径失效。

**处置（D2）**：确立归属原则——**saved 看板拥有全部元数据（settings/约束/粒度/动态开关），override 只拥有 values（和 operator）**；未匹配 saved 的新 override 剥离约束元数据（防 URL 注入）。回填清单为完整字段表（见 §4.4），并补 common 单测 `applyDimensionOverrides.test.ts`。

---

## 3. 方案设计（修订版）

### 3.1 新增「滚动近 N 个月」下限（核心）

**类型**（`DashboardFilterRule`）：

```ts
/** 月粒度在之间筛选器的滚动可选下限：min = 已解析最晚可选月的月初往前 N-1 个月。
 *  undefined = 未启用。仅在 operator=IN_BETWEEN 且 dateRangeGranularity=MONTH 时生效（门禁，见 3.2）。 */
rollingMinAllowedMonths?: number;
```

**锚点语义（三态写死，配套单测）**：

| 最晚侧状态 | 行为 |
|---|---|
| 动态 max（主路径） | min = `startOf(month(已解析动态 max)) − (N−1) 月`，随 4 号规则每月自动 +1；窗口恰好 N 个有数据整月 |
| 固定 max | 窗口**静止不滚**：UI Badge 显示「固定窗口（不滚动）」而非「动态」，保存校验提示「需开启跟随数据更新才能滚动」 |
| 无 max | **拒绝保存 rolling**（校验报错），避免「可选未来月 + N+1 个月」的退化；不采用原方案的 now 退化分支 |

**4 号边界示例**（N=24，2026-11-11，4 号已过 → max=2026-10-31）：本月窗口 `2024-11 ～ 2026-10`；12 月 1–3 号窗口不变；12 月 4 号起自动滑到 `2024-12 ～ 2026-11`。

**N 口径（修正 off-by-one）**：`N = 窗口包含的整月数`。默认区间如需填满窗口应为 **距今 24～1**（原稿 23～1 只有 23 个月）；近 12 个月窗口对应 **12～1**。产品仍可选「默认留 1 个月余量」（23～1），但必须作为明确决策（D4）。注意 `FilterDynamicDateRangePicker` 现有 `DEFAULT_START.count=12`，是否改常量需产品拍板（改了会影响所有新建动态筛选器）。

### 3.2 门禁与输入校验（评审 P1-3 / A4-A6）

- bounds 解析与运行钳制**仅在 `IN_BETWEEN + MONTH`** 消费 rolling；其它算子/粒度一律短路（`NOT_IN_BETWEEN` 夹紧会反转排除语义，`EQUALS` 单值本期不钳）。
- 切换算子或粒度时**清理 rolling 字段**（现状切粒度不清理 `settings.dateRange` 是已有隐藏 bug——粒度降级后界面固定、查询仍动态解析。**M1 必须随 P1 修复**）。
- `N` 校验：整数 `1 ≤ N ≤ 120`；`N=0/负数` 会产生 min>max 全历锁死，`NaN/小数` 产生 Invalid Date / 静默 floor——resolver 侧 `!Number.isInteger || 越界` 视为未配置并 dev 日志，UI `NumberInput min=1 max=120` 禁小数。
- 季度粒度**不开放 rolling**：现有 `FilterQuarterPicker` 按「月份起点比较、提交季度起点」，会产出早于 min 的季度且 clamp 按 quarter 比较夹不住（C2）；若未来支持需先修 picker 对齐逻辑。

### 3.3 查询前钳制（G-B，修订：拆三条路径 + clamp 前置修复）

| 路径 | 处理 |
|---|---|
| 查询参数 | `prepareDashboardFilterRuleForQuery` 对**固定值也钳**（现状只夹动态；固定值分支现在直接短路 return——必须显式改） |
| 展示（chip/picker） | chip 显示钳后值；picker 仍显示原始值会导致「开合弹层把钳值写回」（E4）——picker 输入值同样展示钳后值 |
| 同步写入 | 跨 tab 同值时接收方按自身边界钳制后**写回存储**（避免存储值永久越界 + `isSameRuleSelection` 误判无变化，G1） |

**clamp 前置修复（P1-4，先于扩固定值）**：
- 保留空槽位（去掉 `.filter(v => v !== '')`，否则单边区间 `['',end]` 塌缩成 `[end]`，IN_BETWEEN 变单边）；
- **只改写越界的那一端**，界内值不做周期对齐重写（否则月中日期被静默扩成整月，隐式语义变更）；
- `start>end → start=end` 的退化保留但记入验收说明；
- 抽公共 `resolveRuleBounds(rule, now, {applyDataAvailabilityDelay})` 供 UI/chip/查询/校验共用，Badge「动态 · 当前=」取同一解析结果（不要各算一次）。

### 3.4 跨 tab 同步（P1-6 修订）

现状：查看者在 tab A 改值 → 接收方 `stripDynamicDateSettings` 会**剥掉其它 tab 的动态默认**，本次会话内不再自动滚动。
**处置（D6）**：若保留同步（推荐）：同步只搬 values（钳制后），接收方保留 `settings.dateRange` 动态默认形态；若产品选关闭日期字段同步，删除对应调用。需补 A(24)→B(12)、A→B→A 往返、重置三类单测。

### 3.5 保存期校验（P1-5 修订）

- 口径统一：校验与运行时同用 `applyDataAvailabilityDelay=true`（或明确定义「校验按最宽口径」并写进文档；现状 false/true 混用会在每月 1–3 号误拦/漏拦 1 个月）。
- 扩展覆盖**固定值默认值**（现状只校验动态，且传 `values:[]` 导致固定值恒 `[null,null]`——必须改传真实 values）。
- 错误文案带解析后的实际边界（如「实际最早可选=2024-11」），否则作者无法理解 1–3 号的拦截。

### 3.6 UI（单一开关 + 单卡片，维持上一轮设计）

保持「`● 动态日期 ○ 固定日期`」Radio 提顶驱动两层的重组方案（评审确认数据模型天然支持：约束字段与 `settings.dateRange` 独立）。吸收 UI 可行性评审的实现要求：

- **M1（必做）**：粒度降级清理（见 3.2）；
- **M2**：Radio 与默认区间分区复用 `showValueInput` gate（禁用筛选器不可改形态）；
- **M3**：模式切换逻辑抽到 common 侧模块（`dateRangeMode.ts` 纯函数：DEFAULT_*、isDynamicAllowed、resolveDynamicValues、buildModeChangePatch），避免 common→DashboardFilter 反向依赖；Radio 仍需在月+季显示（否则季的动态规则无法切回固定），「近 N 个月」仅月显示；
- **M4**：月粒度单值 EQUALS 的 `FilterDynamicMonthPicker` 自带同义开关——本期明确「卡片层开关仅区间筛选器」，文档与 i18n 措辞区分；
- 长文案（hint/dynamic_max_description）删除，改 ⓘ + Tooltip（`tabIndex={0}` 键盘可达）；Badge「动态 · 当前={{value}}」显示**合并生效值**（固定 min 与 rolling 取更晚者后的实际下限），i18n 插值用 `{{value}}`（原稿 `{value}` 写法有误）。

---

## 4. 接线清单（补全）

### 4.4 字段归属表（P0-2 落地）

| 字段 | saved 看板 | override 注入 | 查询 key | 审计 diff |
|---|---|---|---|---|
| values / operator | ✓ | ✓（仅有的可覆盖项） | ✓ | ✓ |
| settings（dateRange/singleDate） | ✓ 拥有 | ✗ 剥离 | ✓ | ✓（dateKeys 已含 settings） |
| minAllowedDate / maxAllowedDate | ✓ 拥有 | ✗ 剥离 | ✓ | ✓（已有） |
| enableDynamicMaxAllowedDate / dateRangeGranularity | ✓ 拥有 | ✗ 剥离 | ✓ | ✓（需确认在白名单） |
| rollingMinAllowedMonths（新） | ✓ 拥有 | ✗ 剥离 | ✓ | 需补 `FILTER_SUMMARY_KEYS` 与 eventQueue dateKeys |

### 其余接线

- `getFilterRuleRevertableObject` 补 rolling；
- `pnpm generate-api` **之后必须** `pnpm -F common generate:dashboard-as-code-schema`（生成器有 `--check` 守卫，漏跑会 CI 失败；原稿漏了第二条命令）；
- as-code schema 未设 `additionalProperties:false`，漏更新不会报错只会丢文档——生成命令进 CI 清单；
- i18n zh/en：新增 tooltip/Badge/模式键，废弃 hint/dynamic_max_description（仓库仅两种 locale，删键无残留风险）。

---

## 5. 落地配置指引（新品数据库，依赖 D1 决策）

1. **若定时 CSV 重要（D1=a）**：保留一条全局「首订单时间」筛选器专供定时交付（约束可设静态 24 个月），tab 内各自建滚动约束筛选器；文档与培训说明「CSV 与页面窗口可能不同」。
2. **若仅页面查看（D1=c）**：删除全局筛选器，逐 tab 建：在之间 + 月粒度；约束：最早=近 N 个月（24/12），最晚=跟随数据更新；默认区间=动态距今 N～1（按 D4 口径 24～1 或留余量 23～1）。
3. tab 内若有 **SQL 图表 tile**：tab 筛选器对它无效，需改用全局筛选器或改造 tile（独立需求）。
4. 配置完成后逐 tab 验证：月历置灰范围、4 号前后窗口、chip 文案、保存校验拦截。

---

## 6. 待拍板决策项（收敛后）

| # | 决策 | 建议 |
|---|---|---|
| D1 (P0) | 定时 CSV 是否需支持 tab 筛选器 | 若 CSV 是真实场景 → b（后端合并，另立切片）；否则 a 或 c |
| D2 (P0) | 覆盖路径归属原则（saved 拥有元数据） | ✅ 建议「是」，回填清单按 §4.4 |
| D3 (P1) | 滚动锚点 | ✅ 与最晚可选月耦合（已写入 §3.1）；固定 max=窗口静止；无 max=拒绝保存 |
| D4 (P1) | N 口径与默认窗口 | N=包含整月数；默认区间填满窗口（24～1）还是留 1 月余量（23～1） |
| D5 (P1) | 钳制范围 | 仅 IN_BETWEEN 双端有值；单边/NOT_IN_BETWEEN/EQUALS 不夹（提示或忽略） |
| D6 (P1) | 跨 tab 日期同步 | 保留但只搬钳后 values、保留接收方动态默认 |
| D7 (P2) | 时区/4 号口径统一、页面跨月是否自动刷新 | 至少文档写明差异（前端本地时区+4 号 vs 后端项目时区无 4 号；解析 useMemo 无时间依赖，刷新才滚动） |
| D8 (P2) | 同比 | **原稿建议有误**：24 个月窗口下前 12 个月同比为 null（数据本身只有 24 个月）；「11～1 同比完整」不成立——同比对象全在窗口外，所有月份同比均为 null。需数据团队确认同比指标计算口径后再定默认值建议 |
| D9 (P2) | 季度粒度 rolling | 本期不做（picker 对齐缺陷未修） |
| D10 (P2) | 后端不校验的威胁模型 | 接受并在文档/验收写明：API/SDK/定时 CSV 可绕过，约束是 UI 契约 |

---

## 7. 实施切片（修订：4 个可独立评审的 PR）

| 切片 | 内容 | 预估 |
|---|---|---|
| S1 类型+解析 | rolling 字段 + bounds 扩展 + 门禁/N 校验 + `resolveRuleBounds` 公共化 + filterDateUtils 单测（固定 referenceDate，先红后绿：窗口月数、4 号边界、N=1/0/NaN、固定 max 静止、闰年） | 1 天 |
| S2 UI 重组 | common 抽 `dateRangeMode.ts` + Radio 提顶 + 单卡片两分区 + tooltip/Badge + i18n + M1/M2 修复 | 2 天 |
| S3 钳制+校验+同步 | clamp 前置修复（空槽/只改越界端）+ 查询/展示/同步三路径 + 保存校验扩展与口径统一 + 同步保留动态默认 + utils/overrides 单测 | 1.5–2 天 |
| S4 接线+验收 | revert 对象/eventQueue/审计白名单/generate-api+as-code schema + 全部验收项执行 + 新品数据库逐 tab 配置 | 1–1.5 天 |

合计约 **5.5–6.5 天**（原估 3–4 天偏乐观，评审后修正；不含 D1=b 后端合并切片）。

**测试策略**：聚焦单测（filterDateUtils / FilterInputs utils / FilterConfiguration utils / `common/types/applyDimensionOverrides.test.ts` / `common/compiler/filtersCompiler.test.ts` / userFilterSelections），全部带 timeout；浏览器手动验收按 j27 §8.7 清单（4 号前后各一次、禁用筛选器、移动端、季/日粒度）。

---

## 8. 验收清单（核心项，评审 §6 汇总）

1. N=24、动态 max：窗口恰 24 个整月；4 号前/当天/次日三断言；N=12/1 同理；闰年不偏移。
2. N=0/负/2.5/NaN：拒绝或安全回退，picker 不锁死。
3. 固定 max + rolling：UI 显式「固定窗口（不滚动）」；无 max + rolling：保存被拦。
4. 季/日粒度、NOT_IN_BETWEEN/EQUALS 残留 rolling：不生效或被清理。
5. 单边区间钳制不塌缩；界内月中日期不被改写；chip/picker/查询三处一致。
6. 固定默认值越界保存被拦，toast 带实际边界；1–3 号与 4 号后行为一致。
7. tab A→B 同步钳制；B 动态默认保留；重置/往返同步行为符合 D6。
8. URL/embed 只传 values：settings/动态 max/粒度/rolling 全保留（common 单测）。
9. as-code 导出导入含 rolling；generate-api 产物含字段；操作日志 diff 出现 rolling。
10. 存量看板（无 rolling）：行为与现状逐字节一致。

---

## 9. 风险（评审后主路径风险，非边缘项）

- 定时 CSV/XLSX 与页面窗口不一致（D1 未决前的既定事实）；
- 覆盖路径丢 settings 使「免维护」承诺失效（P0-2 未修前）；
- 同步剥离动态默认（P1-6 未修前）；
- 页面跨月不自动刷新（解析无时间依赖，刷新才滚动）——与「免维护」表述的差距需产品知悉；
- 前端本地时区 + 4 号 vs 后端项目时区无 4 号：每月 1–3 号 UI 与推送/API 可差 1 个月。
