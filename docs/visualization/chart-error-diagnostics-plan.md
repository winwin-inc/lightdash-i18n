# 图表错误态诊断（规划 v3，P0 已实施）

> 状态：**P0 已实施**（提交 65ccbefa3 + 评审修复 fe08ce9e3）；P1/P2 待定。
> v3 同步：评审发现的实现偏差已修复并回写本文（additionalMetrics 用 getItemId、
> 门控标题统一短文案、看板筛选/排序归因接线、SuboptimalState 需用 description 传 ReactNode）。
> v2 修订：判定链改以 explore 为准；P0 拆三步；embed/minimal 门控同批。
>
> 触发反馈（业务方原话意译）：PC 上图表报错后**只显示一句英文**，不知道是哪一列有错误；
> 某个字段改名、某个 SQL 函数不可用，图就直接打不开，人无法控制。移动端是附带问题。
>
> 同批已修复（不属于本计划，见提交 `30b6baad3`）：表格列配置被误清空并落库。

## 1. 结论先行

| 结论 | 说明 |
| --- | --- |
| 错误信息只有一句后端英文原文 | `FieldReferenceError` 只带 fieldId 文本，无图表名、无字段清单、无修复入口 |
| **不能用「查询结果字段」判断字段是否失效** | `itemsMap` 就是 `resultsData.fields`；查询失败首帧为空 → 差集会**把全部字段标红**。这是 `30b6baad3` 刚修掉的同一类错误 |
| 存在性只能由 `explore` 判定 | `explore` 是编译后的字段宇宙；`metricQuery` 只提供「声明了哪些字段」 |
| 看板错误来源不止图表字段 | 看板筛选 / 排序 / 日期缩放会把**不属于图表的 fieldId** 塞进查询，报错 fieldId 在图里根本找不到 |
| 看板错误分支是共享组件 | `EmbedDashboardChartTile` 复用 `GenericDashboardChartTile`，`MinimalDashboard`（定时截图/邮件）也用它 → 字段名会外泄 |
| 另有一个更糟的已知缺陷 | `explore` 加载失败时 `queryEnabled` 为 false、`error` 为 null → 看板**永久骨架**，比「看不到字段」更阻断 |
| 移动端最误导 | `/minimal/.../saved/:uuid` 未接 `apiErrorDetail`，显示「No data available」 |

## 2. 现状证据

### 2.1 错误面 × 可用数据

| 面 | 组件 | 当前渲染 | 图表类型 | 字段清单 | itemsMap |
| --- | --- | --- | --- | --- | --- |
| **S1** Explore / 已保存图表卡 | `components/LightdashVisualization/index.tsx:42-66` | `EmptyState` + `apiErrorDetail.message` | ✅ | ✅ `chartConfig` + provider 的 `unsavedMetricQuery`（未进 context） | 🟡 失败首帧为空 |
| **S2** Explore 结果表 | `common/Table/index.tsx:69-71` | 同上 | — | 🟡 表头已有「字段不存在」黄标 | 🟡 |
| **S3** 看板 tile（建查询失败） | `DashboardTiles/DashboardChartTile.tsx:1997-2036` | `Chart '名字': message` | 🟡 `tile.properties.lastVersionChartKind` | ❌ | ❌ |
| **S3'** 看板 tile（取行失败） | 同上 | 同上 | ✅ `chart.chartConfig.type` | ✅ `chart.metricQuery` | ✅ |
| **S4** Embed tile | `ee/features/embed/.../EmbedDashboardChartTile.tsx:113` | **与 S3 同一个 `GenericDashboardChartTile`** | — | — | — |
| **S5** 移动端最小页 | `pages/MinimalSavedExplorer.tsx:25-78` | **无错误 UI** →「No data available」 | ✅ `savedChart` | ✅ | 🟡 |
| **S6** 定时截图/邮件 | `SchedulerTask.ts:247`、`UnfurlService.ts:1262` | 同 S3（`minimal`） | — | — | — |
| **S7** AI 图表 | `ee/.../AiVisualizationRenderer.tsx:140` | 无 `apiErrorDetail`，空图 | — | — | — |

### 2.2 后端错误形态与「是否适合展示字段」

| error.name / 场景 | 抛出点 | 适合展示字段清单？ | 处理 |
| --- | --- | --- | --- |
| `FieldReferenceError`（维度/指标未知） | `QueryBuilder/utils.ts:146,184` | ✅ | 点名失效字段 + 归因 |
| `FieldReferenceError`（筛选引用未知维度） | `MetricQueryBuilder.ts:1306` | ✅ | 同上，需能识别「来自看板筛选」 |
| `CompileError`（表计算引用不在查询中） | `queryCompiler.ts:148` | 🟡 | 文案写「表计算引用了不在查询中的字段」，**不要写「字段已删除」** |
| `WarehouseQueryError`（SQL 函数/列不可用） | `errors.ts:327` | 🟡 | 只作只读上下文，不高亮；原文进技术详情 |
| `AuthorizationError`（user_attributes 过滤/无权限） | `utils.ts:133-141` | ❌ | 只显示权限文案（沿用 `ErrorState`） |
| `ForbiddenError` 403 | `errors.ts:48` | ❌ | 同上 |
| `NotExistsError`（explore 不存在/编译失败） | `ProjectService.ts:4947,4952` | ❌ | 只显示「模型不可用」 |
| 仓库资源限额 | `utils/warehouseError.ts:13` | ❌ | 复用 `isWarehouseResourceLimitError` |
| `ParameterError` / 缺参数 | `VisualizationCard.tsx:350-359` | ❌ | 沿用现有缺参数 UI |
| 执行期错误（轮询） | `useQueryResults.ts:411-419`（合成 500，`data:{}`） | ❌ 无字段信息 | 只能显示 message |

> 关键：**只有前两类**（`FieldReferenceError`、部分 `CompileError`）值得做字段级诊断。

## 3. 目标与非目标

**目标（PC 优先）**

1. 图表打不开时，**用中文说清楚是哪一列有问题**：`本图有 1 个字段不可用：订单金额（orders_total_amount）`。
2. 同时能看到「图表类型 + 本次查询声明的字段清单」（有 label 显示中文名，否则退回 fieldId）。
3. 后端英文原文收进可折叠的「技术详情」，不占主视觉。

**非目标**

- 不做自动修复（自动猜新字段并替换）——涉及写配置，单独评估。
- 不改后端文案本地化（中英混排只出现在技术详情）。
- 不覆盖 SQL chart / DataApp tile / Vega 自定义 spec 的字段引用（数据模型不同，文案注明「仅列查询字段」）。
- 不给 ErrorBoundary 注入图表上下文。
- Explore 侧**不加「编辑图表」CTA**（已在编辑器里，header 已有「配置」）。
- 不在 P0 做「一键移除失效字段」（写配置，风险另评）。

## 4. 正确的判定链（取代 v1 的差集方案）

原则：**存在性只由 `explore` 判定；`metricQuery` 只提供「声明了哪些字段」；查询结果字段永不参与判定。**

```ts
// 纯函数，无 React 依赖
getChartErrorDiagnosis({
  error: ApiErrorDetail,
  metricQuery: MetricQuery,
  explore: Explore | null,          // 关键：编译后的字段宇宙
  dashboardFilters?,                 // 仅看板
  dashboardSorts?,
}): {
  kind: 'field' | 'permission' | 'notFound' | 'warehouse' | 'parameter' | 'unknown';
  invalid: { fieldId: string; label: string | null;
             group: 'dimension'|'metric'|'tableCalculation'|'unknown';
             origin: 'query'|'filter'|'sort'|'dashboardFilter'|'dashboardSort'|'dateZoom' }[];
  declaredFieldIds: string[];
  confident: boolean;                // 是否敢说「就是这些字段」
}
```

判定顺序（**任一步命中即返回**）：

0. **类型门控**（先于任何字段推断）：
   `AuthorizationError`/`ForbiddenError` → `permission`；`NotExistsError` → `notFound`；
   资源限额 → `warehouse`；`ParameterError` → `parameter`。以上 `invalid: []`，**不展示字段清单**。
1. **结构化优先**：`error.data.fieldId`（P2 之后），命中即 `confident: true`。
2. **文本回退**（4 条正则，逐字对照后端源码）：
   - `Tried to reference (dimension|metric) with unknown field id: (\S+)$`（`utils.ts:147,186`）
   - `Filter has a reference to an unknown (dimension|metric): (\S+)$`（`MetricQueryBuilder.ts:1306`）
   - `Table calculation contains a reference "([^"]+)" to a field`（`queryCompiler.ts:149`，需 `convertFieldRefToFieldId` 归一化）
   - `has a reference to an unknown field: (\S+)$`（`exploreCompiler.ts:451` → 属「模型定义坏」，**不归到图表字段**）
3. **声明字段集**（**不用** `itemsInMetricQuery`，它不含 filters/sorts/additionalMetrics/customDimensions）：
   直接复用 `getFieldsFromMetricQuery(metricQuery, explore)`（`common/src/utils/fields.ts:36-90`）。
4. **归因**（决定文案，必须有）：
   `metricQuery.*` → `query`；图表 filter → `filter`；`sorts[].fieldId` → `sort`；
   看板 filters → `dashboardFilter`；看板 sorts → `dashboardSort`；都不在 → `dateZoom`/不详。
5. **结构差集**（仅当 `explore !== null`）：
   `declaredFieldIds − keys(getItemMap(explore, additionalMetrics, customDimensions, tableCalculations))`。
   自定义指标先判父表是否存在（`explore.tables[additionalMetric.table]`）。
6. **降级**：`confident: false` → 只展示「本次查询共 N 个字段，错误可能来自其中之一」+ 技术详情。

**硬性禁止（写进实现注释）**

- ❌ 用 `resultsData.fields` / `VisualizationProvider` 的 `itemsMap` 判存在性（只用于取 label）。
  先例：`useColumns.tsx:349,374-375` 已特意加空集守卫。
- ❌ `itemsMap` 为空/undefined 时做任何差集。
- ❌ 在 `AuthorizationError` / `NotExistsError` 上产出字段诊断或列出字段清单（等于泄露 schema 边界）。

## 5. 分阶段方案

### P0-a（~0.5 天）：纯函数 + 单测，无 UI

- 新增 `utils/chartErrorDiagnosis.ts`（含上面判定链）+ `chartErrorDiagnosis.test.ts`。
- 单测覆盖：三类文案命中；权限/404 不产出字段；`explore === null` 时 `confident:false`；
  `itemsMap` 缺失/过期不参与；归因到 `dashboardFilter` / `sort`；表计算引用归一化。
- 验收：单测全绿，无 UI 改动。

### P0-b（~0.5–1 天）：Explore 图表卡（PC）

- `VisualizationProvider` 把已有 `unsavedMetricQuery` + `explore` 放进 context。
- `LightdashVisualization` 的 `apiErrorDetail` 分支：用 `EmptyState` 的 `children`（`description` 是 `<Text span>`），
  `pt/pb` 传 `md` 压缩留白，内容放进 `ScrollArea`。
- 展示：中文摘要 + 图表类型徽标 + 字段清单（分组、失效标红、`Truncate` + tooltip）+ 技术详情折叠。
- **不加**「编辑图表」CTA。
- 验收：删掉某字段后打开图表，能看到中文点名 + 字段清单；zh/en 文案齐全。

### P0-c（~0.5 天）：看板 tile + **embed/minimal 门控同批**

- `useDashboardChartReadyQuery` 单独暴露 `chartQuery.data`（error 时 `data` 为 undefined，`chart`/`explore` 本来在 `data` 里）。
- tile 错误分支：**3x3 tile 只放 2 行**（`1 个字段不可用：X` + `查看详情 ›`），详情走 `Modal`/`Drawer`（`ScrollArea.Autosize mah="70vh"`）。
- **门控必须与 P0-b 同批上线**：`minimal`（定时截图/邮件）与 embed 只显示「图表名 + 错误类别」，不列字段。
  embed 判定用显式能力位（由 `EmbedDashboardChartTile` 传入），不要用 `useEmbed()`（非 embed 场景也会返回默认对象）。
- 复用已有的 `EditChartMenuItem`（`DashboardChartTile.tsx:2012`，自带 manage Explore 权限判断），**不新增重复入口**。
- 注意：Modal 会 portal 到 body，绕过容器的 `ph-no-capture`，需确认不违反录制策略。
- 验收：3x3 tile 不溢出；embed token 页面 DOM 不含 fieldId；minimal 截图与现在一致。

### P1（~0.5 天）：移动端最小页（附带）

- `MinimalSavedExplorer` 传入 `apiErrorDetail`（**不是照抄** `VisualizationCard` 的 memo——minimal 没有 merge/分页表路径），并给 provider 补 `explore`。
- **先与产品确认**：定时邮件/链接预览图里是否也要显示真实错误（当前是「No data available」）。
- 顺手可覆盖 AI 图表（`AiVisualizationRenderer` 同样没传 `apiErrorDetail`）。

### P2（需后端配合）：结构化 fieldId

- 在 `FieldReferenceError` / filter 引用错误 / `CompileError` 抛出点补 `data: { fieldId, fieldType, exploreName, tableCalculationName? }`。
- 前端优先读 `data.fieldId`，正则回退**长期保留**（执行期错误拿不到 `data`）。
- 收益边界：只覆盖**编译期**错误；执行期错误仍只有 message。

### P3（更远）：预防

- 保存前软校验（warning 不阻断）；字段详情页展示「被 N 个图表使用」作为改名/删除前的影响面提示。

## 6. 单列的已知缺陷（比字段诊断更阻断，建议同批或紧随）

**`explore` 加载失败 → 看板永久骨架**：`useDashboardChartReadyQuery.ts:157` 只解构 `data`，
explore 的 error 被丢弃；`queryEnabled` 要求 `explore` 存在（`:178-184`）→ 查询不发、`error` 为 null
→ tile 落进 loading 分支（`DashboardChartTile.tsx:2045`）**永远转圈**。
建议：把 explore 的 error 一并纳入 `error`，至少能显示「模型不可用」。

## 7. 风险与约束

1. **错误面板是 early return**，不要替换掉 header 的「配置 / 编辑图表」入口。
2. **`readyQuery.error` 时 `data` 为 undefined**，两种情况（有 data+error / 只有 error）都要处理。
3. **`itemsMap` 可能是上一次查询的**（`keepPreviousData: true`），只能取 label，**不能判存在性**。
4. **看板 filter/sort/dateZoom 的 fieldId 不在图里**，归因错就会指错列。
5. **embed / 截图 / 邮件会暴露 schema**：字段名、表名按场景收敛，`minimal` 一律降级。
6. 「查不到字段」既可能是被删、也可能被 user_attributes 过滤 → 文案用「不可用/找不到」，不要写「已删除」。
7. 3x3 tile 正文约 130px（`gridUtils.ts:17` 行高 55、react-grid margin 10），**内联清单放不下**。
8. i18n：zh/en 都要加 key，仓库无类型校验；测试环境只加载 en（`testing/vitest.setup.ts:6`），断言中文需先补 zh。
9. 表图可能上百字段：默认折叠到「失效 + 前 5 个」。

## 8. 明天开工 checklist

- [ ] **先改代码前确认产品口径**：embed / 定时截图是否允许出现字段名（默认：不允许）
- [ ] P0-a：`getChartErrorDiagnosis` 纯函数 + 单测（含归因与降级）
- [ ] P0-b：context 增加 `unsavedMetricQuery`/`explore`；`LightdashVisualization` 接线；zh/en 文案
- [ ] P0-c：`useDashboardChartReadyQuery` 暴露 `chart`；tile 2 行摘要 + Modal 详情；embed/minimal 门控
- [ ] 单测：失效字段检测、`explore === null` 降级、embed 不渲染 fieldId、minimal 降级
- [ ] 手工回归：3x3 tile 无溢出、跳转复用现有菜单项、定时截图保持原样
- [ ] 附带：P1 移动端（确认产品口径后再做）
- [ ] 排期：P2 后端补 `data.fieldId`

## 9. 相关链接

- 列配置误清空止血修复：`docs/visualization/table-ux-optimization-plan.md`
- 后端字段改名迁移：`packages/backend/src/services/RenameService/`（未覆盖 `merge` / `saved_sql` / `DATA_APP_VIZ`）
