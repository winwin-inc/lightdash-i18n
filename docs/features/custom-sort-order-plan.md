# 维度按自定义值顺序排序（业态排序）

> 状态：**草案 / 待确认**（本文只做调研与方案，不含实现）
> 需求来源：业态字段需要按「大卖场 → 大超市 → 小超市 → 便利店 → 食杂店」固定排序，
> 现有 A-Z / Z-A 表达不了这个业务顺序。
> 现状 UI（截图）：`排序方式 / 然后通过` + `A-Z·Z-A` + `空值 默认·最前·最后`，支持多字段与拖拽调序。

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| 能否实现 | **能**。不需要 DB migration，改动集中在「排序模型 + ORDER BY 生成 + 排序面板 UI」三处 |
| 推荐方案 | **扩展 `SortField`，加 `valueOrder?: string[]`（有序值列表）**，SQL 用 `CASE WHEN ... THEN rank END` 生成排名（本仓库已有月名/星期名的同款先例） |
| 工作量 | 后端+类型 ~0.5d，前端面板 ~1.5d，测试/联调 ~1d，合计 **~3d** |
| 主要风险 | 用户输入进 SQL 的转义、BigQuery 需 CTE（已有先例）、未列出值/空值语义、值列表来源（大基数） |
| 立即可用的 workaround | **0 开发**：用「自定义 SQL 维度」建一个 `业态排序`（CASE 返回 1..5），再按这个数字字段排序。适合先给业务方救急 |

> 上游 Lightdash 没有这个功能（issue #9377 仍 open，无 PR 可移植），需要自研。

---

## 1. 现状调研（含证据）

### 1.1 排序模型

```ts
// packages/common/src/types/metricQuery.ts:144
export type SortField = {
    fieldId: string;      // 必须是 explore 里的字段
    descending: boolean;
    nullsFirst?: boolean; // 空值位置
};
```

- 排序存在 `metricQuery.sorts`，跟着 chart 版本（JSON 列）走 → **加可选字段零 migration**。
- 表格/透视的点击排序、`结果卡` 的排序按钮都写同一份 `sorts`。

### 1.2 会「重建」sorts 的 3 个地方（加字段后必须同步保留）

| 位置 | 行为 | 要改什么 |
|---|---|---|
| `components/SortButton/Sorting.tsx:31-55` | 切换字段方向时 `newSort = { fieldId, descending, ...nullsFirst }` | 同时保留 `valueOrder` |
| `components/Explorer/ResultsCard/ColumnHeaderSortMenuOptions.tsx:44-56` | 点表头排序会**替换全部** sorts，且只构造 `{fieldId, descending}` | 保留同字段的 `valueOrder`（或明确「点表头=清掉自定义顺序」） |
| `components/Explorer/index.tsx:120` | 默认排序（首列升序） | 无需改 |

### 1.3 SQL 生成

`packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts:1405-1496`（`getSortSQL`）：

```ts
let fieldSort = `${q}${sort.fieldId}${q}${sort.descending ? ' DESC' : ''}${getNullsFirstLast(sort)}`;
// 已有三种「语义排序」分支：
// 1. custom bin 维度 → 用 {fieldId}_order 列
// 2. MONTH_NAME   → sortMonthName(...)  + requiresQueryInCTE = true
// 3. DAY_OF_WEEK_NAME → sortDayOfWeekName(...) + requiresQueryInCTE = true
```

`sortMonthName` / `sortDayOfWeekName`（`packages/backend/src/utils/QueryBuilder/utils.ts:420-468`）就是**按固定值顺序排序**的现成范式：

```sql
(
  CASE
    WHEN "month_name" = 'January' THEN 1
    ...
  END
) DESC
```

→ 我们的需求是同一件事，只是值列表由用户提供而不是硬编码。
→ `requiresQueryInCTE = true` 也是现成的兜底（BigQuery 在 ORDER BY 里用函数引用分组列需要 CTE）。

### 1.4 前端排序面板

- 入口：`components/Explorer/ResultsCard/ResultsCard.tsx:121` 的 `<SortButton isEditMode={isEditMode} sorts={sorts} />`。
- 面板：`SortButton/index.tsx` → `Sorting.tsx`（`@hello-pangea/dnd` 拖拽调整字段顺序、`+ 添加排序字段`）+ `SortItem.tsx`（每行的 A-Z/Z-A 与空值 SegmentedControl）。
- **只在 Explore 编辑模式可编辑**（`isEditMode` 来自 explorer store）；看板 / embed / 查看模式只读。
- 候选值可得：结果表 `resultsData.rows` 已在内存（`ResultRow = { [fieldId]: { value: { raw, formatted } } }`），可直接去重出该维度的值列表。

### 1.5 其它会受影响的链路

- 校验：`MetricQuery` 是纯 TS 类型走 TSOA 生成校验，加可选字段 = 兼容。
- 生成物：`pnpm generate-api`、`pnpm -F common generate:chart-as-code-schema` 必须重跑。
- AI agent 的 `sortField` zod schema（`common/src/ee/AiAgent/schemas/sortField.ts`）可选补字段（不补也能用，只是 AI 不能指定）。
- pivot / CSV / underlying data / dashboard：都吃同一份 `metricQuery.sorts`，**自带生效**，无需单独改。

---

## 2. 数据模型方案

```ts
export type SortField = {
    fieldId: string;
    descending: boolean;
    nullsFirst?: boolean;
    /**
     * 维度按值自定义排序：数组顺序 = 期望顺序（从前往后）。
     * 只对维度有意义；为空数组/undefined = 关闭，回退 A-Z / Z-A。
     */
    valueOrder?: string[];
};
```

约束与语义：

- 仅允许**字符串型维度**（`DimensionType.STRING` / 枚举型）；数值/布尔/指标忽略。
- 建议前端限制条目数（如 ≤ 200）与单值长度（如 ≤ 200 字符）。
- 未列出的值 → **ELSE 桶**，排在已列值之后，桶内再按 `field <dir>` 兜底（保证确定性）。
- 空值（NULL）→ 显式进 CASE（`WHEN field IS NULL THEN <n+1>`），并在自定义顺序模式下**隐藏/说明**「空值」选项（因为它作用于 CASE 结果而非原值）。

---

## 3. SQL 设计

新增 `sortByValueOrder(...)`（放 `utils.ts`，与 `sortMonthName` 并列）：

```sql
-- 升序：rank 1..N，未列出 = N+1
ORDER BY
  (CASE WHEN "业态" = '大卖场' THEN 1
        WHEN "业态" = '大超市' THEN 2
        ...
        WHEN "业态" IS NULL THEN 6
        ELSE 6 END) ASC,
  "业态" ASC

-- 降序：反转 rank（N..1），未列出 = 0，保证「未列出仍在末尾」
ORDER BY
  (CASE WHEN "业态" = '大卖场' THEN 5
        ...
        ELSE 0 END) DESC,
  "业态" DESC
```

要点：

1. **转义**：值来自用户输入，必须走 `warehouseSqlBuilder.escapeString`（`common/src/types/warehouse.ts:96`）；字段名照旧用 `getFieldQuoteChar()`。
2. **CTE**：`requiresQueryInCTE = true`（照抄 month/day 先例），避免 BigQuery / 聚合查询在 ORDER BY 里引用分组列报错。
3. **降序**：不要只加 `DESC` 到升序 CASE 上，否则「未列出」会跑到最前面；用反转 rank 的写法。
4. **多字段**：自定义顺序只是其中一个 ORDER BY term，后面再接兜底 term 与其它排序字段，语义与现有 `然后通过` 一致。
5. **「未列出」的语义（已定）**：永远排在最末，桶内再按 `field <方向>` 排（A-Z / Z-A）。
   注意这与空值的 `NULLS FIRST/LAST` 翻转行为**不同**：反向排序只反转用户列出的那一段，
   不会把未知值提到最前面——未知值的优先级不该因为点了「反序」而升高。
6. **A-Z / Z-A 的文案（已定）**：控件保留，但开启自定义顺序后文案改为「正序 / 反序」
   （沿用 `getSortLabel()` 按字段类型换文案的既有机制），不新增控件。
5. **LIMIT/OFFSET**：排序在 limit 之前，`requiresQueryInCTE` 的包装已有既有测试覆盖，不需要额外处理（实现时要真机验证分页表）。

---

## 4. UI 方案：多值怎么选、怎么排

### 方案 A（推荐）：排序行内展开「值顺序」编辑器

交互步骤：

1. 在 `SortItem` 行里，字段是字符串维度时显示一个「自定义顺序」按钮（图标 + 文案），点击在该行下方展开面板。
2. 面板两块：
   - **已选顺序**（chips 列表，`@hello-pangea/dnd` 拖拽调序；每项可 ↑/↓ 按钮与删除 —— 键盘可达）
   - **候选值**（**全部来自数据库**：`POST /projects/:projectUuid/field/:fieldId/search` 返回的 distinct 值 +
     服务端搜索；点一下加入已选，不提供手打输入）
3. 面板底部说明未列出值的处理：「未列出的值排在最后，按 A-Z / Z-A」。
4. 顶部 A-Z/Z-A 保留，但文案变成「正序 / 反序」，含义是「按自定义顺序 / 反着排」。

优点：和现有 A-Z/Z-A、空值三件套同一行语义；值通常 5–20 个，展开即可搞定；复用仓库已有 dnd 依赖。
缺点：行内高度会变高（可限制 chips 区最大高度 + 滚动）。

### 方案 B：独立弹窗（TransferList 左候选 / 右已选）

适合值特别多（几十上百）。缺点：一次只能编一个字段，切字段要开合弹窗，与「多字段排序」的节奏不搭。
可作为后续增强（`valueOrder.length > 30` 时提示改用弹窗），**不建议 v1 就做**。

### 值来源：全部来自数据库（不自造值）

**不需要新增接口**——仓库已有字段值搜索（筛选器自动补全用的就是它）：

```
POST /projects/:projectUuid/field/:fieldId/search
body: { search, limit, table, filters, forceRefresh, parameters, dashboardContext }
resp: { search, results: string[], cached, refreshedAt }
```

- 路由：`packages/backend/src/routers/projectRouter.ts:104` → `ProjectService.searchFieldUniqueValues`
  → `_getFieldValuesMetricQuery`（`ProjectService.ts:3642`，**只允许 dimension**，超 `query.maxLimit` 直接报错）。
- 前端封装：`packages/frontend/src/hooks/useFieldValues.ts`（`getFieldValues` / `useFieldValues`），
  默认上限 `MAX_SELECT_ALL_LIMIT = 500`，结果按 `compareFieldValues`（zh-CN、数字感知）排序。

三个必须遵守的约束（fork 特有，源码注释写得很清楚）：

| 约束 | 原因 | 做法 |
|---|---|---|
| **必须走 `enqueueFieldSearch` 串行队列** | 这是「带 `sql_filter` + GROUP BY」的重查询；仓库引擎的内存限额是**全局限额**，并发会打满（`HGERR_code 53200`），连带把看板查询打挂 | 直接复用 `useFieldValues`（内部已入队 + 同字段去重） |
| **懒加载 + debounce** | 打开面板就查 = 每次多一次重查询 | 只有点开「自定义顺序」才请求；搜索 300ms debounce；同字段复用 react-query 缓存 |
| **先用本地结果打底** | 少打一次重查询 | `useFieldValues(search, initialData, …)` 的 `initialData` 传当前结果该列去重值（Top N），用户继续搜索时才打 DB |

两个语义决定：

- **不传当前筛选**（`filters: undefined`）：排序配置应与筛选解耦，否则同一张图换个筛选、可选值就变了。
  代价是查询更重（无筛选下推），因此更依赖上面的串行队列 / 懒加载 / 缓存。
- **只用数据库返回值**（不做手打输入）。已选值若当前数据里找不到（值被删除、或不在本次搜索结果里），
  仍保留在 chips 中并**标灰 + 提示「当前数据中未找到该值」**，不静默丢配置。

### 只读场景（看板 / embed / 查看模式）

排序面板本身只在编辑模式可编辑。只读时在 `SortButton` 的 Badge 上展示一个「自定义顺序」标记（tooltip 显示前 N 个值），让人知道这一列不是按字母排的。

---

## 5. 改动清单（文件级）

| 层 | 文件 | 改动 |
|---|---|---|
| common | `types/metricQuery.ts` | `SortField.valueOrder?: string[]` |
| common | `ee/AiAgent/schemas/sortField.ts` | 可选补字段（不补则 AI 不能指定） |
| backend | `utils/QueryBuilder/utils.ts` | 新增 `sortByValueOrder(dimension, values, fieldQuoteChar, escapeString, descending)` |
| backend | `utils/QueryBuilder/MetricQueryBuilder.ts` | `getSortSQL` 增加分支 + `requiresQueryInCTE = true` |
| backend | `utils/QueryBuilder/MetricQueryBuilder.test.ts` | 新增 SQL 断言用例（升/降/未列出/转义/null/多字段） |
| frontend | `components/SortButton/Sorting.tsx` | 保留 `valueOrder`；新增 `onSetSortFieldValueOrder` |
| frontend | `components/SortButton/SortItem.tsx` | 「自定义顺序」按钮 + 展开面板（chips + 候选） |
| frontend | `components/SortButton/ValueOrderEditor.tsx` | 新增（chips 拖拽调序 + DB 候选列表 + 服务端搜索 + 失效值标灰） |
| frontend | `components/Explorer/ResultsCard/ColumnHeaderSortMenuOptions.tsx` | 点表头排序时保留/清空 `valueOrder`（需产品决策） |
| frontend | `utils/sortUtils.ts` | 判断字段是否支持自定义顺序、只读展示文案 |
| frontend | `public/locales/{en,zh}/translation.json` | 新增 key（下表） |

新增 i18n key（挂在现有 `components_sort_button.*` 下）：

| key | en | zh |
|---|---|---|
| `custom_order` | `Custom order` | `自定义顺序` |
| `custom_order_tooltip` | `Sort values in a fixed order (e.g. 大卖场 → 食杂店)` | `按固定值顺序排序（如 大卖场 → 食杂店）` |
| `custom_order_empty` | `No values yet — pick from the list or type to add` | `还没有值：从下面选择，或直接输入添加` |
| `custom_order_search` | `Search values` | `搜索值` |
| `custom_order_search_placeholder` | `Search values from the database` | `搜索数据库中的值` |
| `custom_order_missing_value` | `Not found in current data` | `当前数据中未找到该值` |
| `custom_order_limit_hint` | `Showing first 500 values, search to narrow down` | `仅展示前 500 个值，可搜索缩小范围` |
| `custom_order_candidates` | `Values in this result` | `当前结果中的值` |
| `custom_order_others_hint` | `Values not listed come last, sorted A-Z / Z-A` | `未列出的值排在最后，按 A-Z / Z-A` |
| `custom_order_badge` | `Custom order` | `自定义顺序` |
| 生成物 | `pnpm generate-api` / `generate:chart-as-code-schema` | 必须重跑 |

---

## 6. 工作量与并行拆分（可用多 agent）

| 阶段 | 内容 | 预估 | 并行 |
|---|---|---|---|
| P0 | common 类型 + backend `sortByValueOrder` + SQL 单测（含方言/转义/降序语义） | 0.5d | ✅ 与 P1 文件不重叠 |
| P1 | 前端 `ValueOrderEditor`（独立文件 + 单测：调序/去重/失效值标灰/搜索防抖/候选合流） | 1d | ✅ |
| P2 | `SortItem`/`Sorting` 接线 + 候选值去重 + 只读标记 + i18n | 0.5d | 依赖 P0/P1 的接口 |
| P3 | 生成物 + typecheck/lint/test + 真机（多字段、分页表、透视、CSV） | 0.5d | 串行收尾 |

---

## 7. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R1 | 值拼进 SQL → 注入 | 高 | 一律 `escapeString`；单测覆盖 `'`、`\'`、中文/emoji |
| R2 | BigQuery 在 ORDER BY 用表达式引用分组列报错 | 高 | `requiresQueryInCTE = true`（复用 month/day 先例） |
| R3 | 降序时「未列出」跑到最前 | 中 | 反转 rank（§3），单测断言 |
| R4 | 空值语义与现有「空值 默认/最前/最后」冲突 | 中 | NULL 显式进 CASE；自定义顺序模式下隐藏空值选项并解释 |
| R5 | 用户点表头排序把自定义顺序冲掉 | 中 | `ColumnHeaderSortMenuOptions` 保留同字段值；产品决策见 §8 |
| R6 | 值超过 500 条 / 搜不到 | 中 | 服务端搜索 + 上限 500；未列出的走 ELSE 桶；面板明示「只展示前 500 个，可搜索」 |
| R7 | 字段值搜索是重查询，并发会打满引擎内存 | 高 | 复用 `useFieldValues`（`enqueueFieldSearch` 串行队列 + 同字段去重）、懒加载、`initialData` 打底 |
| R8 | 已选值在当前数据中不存在（被删/改名） | 低 | chips 标灰 + 提示，保留配置；CASE 里该 WHEN 保留无害 |
| R9 | 生成物过期导致 CI 红 | 高 | 重跑 generate-api + chart-as-code schema |
| R10 | 指标字段误用 | 低 | UI 只对字符串维度开放；后端忽略非维度 |

---

## 8. 待确认（产品决策）

### 已定（按「合理默认」收敛，无需再讨论）

1. **未列出的值**：**排在最后，桶内按 A-Z / Z-A**。
   - 理由：自定义顺序本质是业务优先级排名，未知值（新分类、脏值、null）不应插进已知排名里；
     桶内再用 `field <方向>` 兜底，保证结果确定性、可解释（换仓库/换执行计划都一样）。
   - 不选「保持库默认顺序」：跨仓库不确定，翻页/分页会抖。
   - 不选「排最前」：业务上没人想把「其它」放第一条。
   - 反序时**不**把未列出值提到前面（与 `NULLS` 翻转不同，见 §3 第 5 点）。
2. **A-Z / Z-A**：**保留控件，文案改「正序 / 反序」**。
   - 理由：控件本来就在每行上，隐藏它还得补一个「反序」开关（更多 UI、更多状态）；
     直接复用 `getSortLabel()` 的按类型换文案机制，改动最小、语义准确。
3. **候选值是否受当前筛选影响**：**不受**（`filters: undefined`）。
   - 理由：排序是图表级配置，必须与「当前看什么数据」解耦，否则换个筛选可选值就变了，
     已配置的值还会突然从候选里消失（用户误以为丢了，重复添加）。
   - 代价：查询更重（无筛选下推）→ 已用串行队列 + 懒加载 + 缓存 + `initialData` 打底兜住。

### 仍需确认（不影响 P0 开工）

4. **点表头排序**：保留该字段的 `valueOrder`（推荐）还是清空？（默认按「保留」实现）
5. **作用范围**：只给 Explore 排序面板；表头右键菜单要不要也能「按自定义顺序」（+0.5d，需要弹窗）
6. **跨图表复用**：v1 只存在该图表的 sorts 里；要不要保存到字段/项目级（v2）

> 附：如果只是应急，先用「自定义 SQL 维度」建 `业态排序`（CASE 返回 1..5）再按它排序，**今天就能做**，无需开发。
