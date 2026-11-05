# 图表错误态诊断与可恢复（规划）

> 状态：**草案（待开发）**。本文只描述问题、结论与分阶段方案，未实施。
> 触发反馈（业务方原话意译）：图表报错后**什么都看不到**——不知道这张图用了哪些字段、
> 原本是什么图表类型和配置，人也无法自行修复；某个字段改名、某个 SQL 函数不可用，
> 图表就直接打不开。希望能「看得见、改得动」。
>
> 同批已修复（不属于本计划，见提交 `30b6baad3`）：表格列配置（列名/隐藏/冻结/宽度）
> 被误清空并落库。本计划解决的是「**图表已经坏了之后**，用户无信息、无手段」的问题。

## 1. 结论先行

| 结论 | 说明 |
| --- | --- |
| 只有 3 个面真正渲染「图表错误 UI」 | Explore 图表卡、看板 tile、Explore 结果表；另有移动端最小页**根本没有错误 UI** |
| 错误信息只有一句英文原文 | 后端 `FieldReferenceError` 只带 `fieldId` 文本，无图表名、无字段清单、无修复入口 |
| 数据其实大多已在手上 | Explore 面：`chartConfig` + `unsavedMetricQuery` + `itemsMap` + `useExplore` 都在同一组件链；只差接线 |
| 看板 tile 是「数据被丢掉」的典型 | 错误分支在 `VisualizationProvider` **之外**；`readyQuery.error` 时连 `data` 都没有，只剩 `tile.properties.lastVersionChartKind` |
| 移动端最误导 | `/minimal/.../saved/:uuid` 未接 `apiErrorDetail`，落进 `SimpleChart` 的 `resultsData.error → <EmptyChart/>`，显示「No data available」 |
| 缺失字段的 fieldId 只在英文 message 里 | 短期只能正则解析（脆）；正路是后端 `FieldReferenceError` 补 `data.fieldId` |

## 2. 现状证据（调研结论）

### 2.1 错误面 × 可用数据

| 面 | 组件 | 当前渲染 | 图表类型 | 字段清单 | itemsMap |
| --- | --- | --- | --- | --- | --- |
| **S1** Explore / 已保存图表卡 | `components/LightdashVisualization/index.tsx:42-66` | `EmptyState` + `apiErrorDetail.message` | ✅ `visualizationConfig.chartType` | ✅ `chartConfig` + provider 的 `unsavedMetricQuery`（未进 context） | 🟡 失败首帧为空 |
| **S2** Explore 结果表 | `common/Table/index.tsx:69-71` → `ExplorerResultsNonIdealStates.tsx:275-298` | 同上（一句 message） | — | 🟡 表头已有「字段不存在」黄标 | 🟡 |
| **S3** 看板 tile | `DashboardTiles/DashboardChartTile.tsx:1997-2036` | `Chart '名字': message` | 🟡 `lastVersionChartKind`（粗） | ❌ | ❌ |
| **S3'** 看板 tile（取行失败） | 同上 | 同上 | ✅ `chart.chartConfig.type` | ✅ `chart.metricQuery` | ✅ `executeQueryResponse.fields` |
| **S5** 移动端最小页 | `pages/MinimalSavedExplorer.tsx:25-78` | **无错误 UI**，显示「No data available」 | ✅ `savedChart` | ✅ `savedChart.metricQuery` | 🟡 |
| **S8** 渲染期异常 | `features/errorBoundary/ErrorBoundary.tsx:16-57` | Sentry fallback，无图表上下文 | ❌ | ❌ | ❌ |

（完整矩阵含 embed / AI / SQL chart / DataApp 见实施时的调研附件；本轮不覆盖后三者，数据模型不同。）

### 2.2 后端错误形态

| 场景 | 错误 | message 形态 | 是否结构化 |
| --- | --- | --- | --- |
| 字段被 dbt 删除/改名 | `FieldReferenceError` 400 | `Tried to reference dimension with unknown field id: <id>` | ❌ 仅字符串 |
| 字段仅存在于 filter | 400 | `Filter has a reference to an unknown dimension: <id>` | ❌ |
| 表计算引用不存在字段 | `CompileError` 400 | 含 `${ref}`，**不含表计算名**（formula 模式例外） | ❌ |
| SQL 函数/列不可用 | `WarehouseQueryError` 400 | 数仓原文 | 🟡 有时含行列号 |
| explore 不存在/编译失败 | `NotExistsError` 404 | `Explore "x" does not exist.` / `has an error.`（**丢失 dbt 编译详情**） | ❌ |

`ApiErrorDetail.data` 声明为 `{[k]: string}`，但实际可能塞 number（如 `lineNumber`），显示前需 `String()`。

### 2.3 现成可复用的零部件

- `itemsInMetricQuery`（`common/src/index.ts:1581`）：`MetricQuery → fieldId[]`
- `getItemMap` / `getItemId` / `getItemLabel`：标签与存在性判定
- `useColumns` 的 `invalidActiveItems`（`hooks/useColumns.tsx:345-376`）：**缺失字段检测已有现成实现**
- 文案 `hooks_columns.not_found_in_dbt_project`（中英都有）
- 图表类型文案 `components_explorer_visualization_card_options.chart_types.*`
- `ErrorState` 的 `error.name` 分类（Forbidden / Authorization / NotExists）

## 3. 目标与非目标

**目标**

1. 图表打不开时，能直接看到：**图表类型 + 这张图用到的字段 + 哪些字段已失效**。
2. 能直接跳到「编辑图表」去修（不再需要自己回忆/猜）。
3. 移动端最小页不再把错误伪装成「无数据」。

**非目标（本轮不做）**

- 不做自动修复（如自动猜测改名后的新字段并替换）——风险高，单独评估。
- 不改后端错误文案的本地化（仍会中英混排）。
- 不改 RenameService 的迁移范围（`merge` / `saved_sql` / `DATA_APP_VIZ` 未覆盖是既有事实，另立项）。
- 不覆盖 SQL chart / DataApp tile（数据模型不同）。
- 不给 ErrorBoundary 注入图表上下文（crash 场景数据链已断）。

## 4. 分阶段方案

### P0（约 0.5 天）：Explore 图表卡 + 移动端最小页

零新取数，只做接线与展示。

1. 新增纯展示组件 `components/LightdashVisualization/ChartErrorDetails/index.tsx`
   - props：`{ chartType, metricQuery, itemsMap?, pivotConfig?, children? }`
   - 渲染：
     - 图表类型徽标（复用 `chart_types.*` 文案）
     - 字段清单（维度 / 指标 / 表计算分组；有 `itemsMap` 显示 label，否则退回 fieldId）
     - 失效字段高亮（`itemsInMetricQuery(metricQuery)` 中不在 `itemsMap` 的 id），复用
       `hooks_columns.not_found_in_dbt_project` 文案
     - 折叠：默认只显示「共 N 个字段，其中 M 个已失效」，点击展开完整清单
   - **只读**，不写任何配置、不发请求。
2. `VisualizationProvider` 把已有的 `unsavedMetricQuery` 放进 context（`context.ts` 加一个字段），
   `LightdashVisualization` 的 `apiErrorDetail` 分支在 `description` 下方挂 `<ChartErrorDetails />`。
   注意 `EmptyState.description` 是 `<Text span>`，需用 `children`（`common/EmptyState/index.tsx:52`）。
3. `pages/MinimalSavedExplorer.tsx` 照抄 `VisualizationCard` 的 `apiErrorDetail` memo 并传给
   `VisualizationProvider`，让移动端显示真实错误而不是「No data available」。`minimal` 下做降级：
   只显示图表类型 + 失效字段数，不展开完整字段列表。

**验收**：把某个已保存图表的字段在 explore 里删掉 → 打开图表 → 能看到「图表类型 + 失效字段 id/label + 编辑入口」；移动端不再显示 No data available。

### P1（约 1 天）：看板 tile

1. `hooks/useDashboardChartReadyQuery.ts` 增加返回值 `chart: chartQuery.data ?? data?.chart`、
   `explore`（`chartQuery` / `useExplore` 已在 hook 内执行，只是没返回）。
2. `DashboardChartTile` 错误分支在 `SuboptimalState` 下复用 `<ChartErrorDetails />`；
   `chart` 为空（图表被删/无权限）时降级为不列字段。
3. `minimal` / embed 分级：embed 只显示「图表名 + 错误类别」，不暴露表名/字段名
   （截图与外部租户场景需要收敛 —— 风险 §6-4）。

**验收**：看板上字段被删的图表能列出失效字段并可直接「编辑图表」。

### P2（可选，需后端配合）：把字段失效变成结构化信息

1. 后端在 `FieldReferenceError` / filter 引用错误 / `CompileError`（TC 引用）抛出点补
   `data: { fieldId, fieldType, exploreName, tableCalculationName? }`
   （抛出点：`packages/backend/src/utils/QueryBuilder/utils.ts:146,184`、
   `MetricQueryBuilder.ts:1306`、`packages/backend/src/queryCompiler.ts:148`）。
2. 前端优先读 `apiErrorDetail.data.fieldId`，读不到再退回正则（保持兼容）。
3. 顺带把 `Explore "x" has an error.` 透出 dbt 编译摘要（`ProjectService.ts:4945` 现在把详情丢了）。

**验收**：错误面板能精确高亮是哪几个字段失效，且不依赖文案格式。

### P3（更远）：预防

- 保存前软校验（warning 不阻断），复用 `ValidationService` 的判定；
- 字段详情页展示「被 N 个图表使用」，作为 dbt 侧改名/删除前的影响面提示。

## 5. 风险与约束（实施时必须遵守）

1. **错误面板是 early return**，不要顺手替换掉 header 的「配置 / 编辑图表」入口。
2. 看板 `readyQuery.error` 时 `dashboardChartReadyQuery` 为 `undefined`，**必须判空**；
   两种情况（有 data+error / 只有 error）都要处理。
3. `itemsMap` 在错误首帧可能为空、也可能是**上一次查询**的（`keepPreviousData`），
   不能当作「当前字段集」；字段清单以 `metricQuery` 为准，`itemsMap` 只用于取 label。
4. **embed / 截图 / 定时邮件会暴露 schema**：字段名、表名、SQL 片段按场景收敛，`minimal` 一律降级。
5. 「查不到字段」既可能是字段被删（`FieldReferenceError`），也可能是被 user_attributes 过滤
   （`AuthorizationError`），文案不要一律写「字段不存在」。
6. 小 tile 空间有限（3x3），清单要可折叠、可滚动；`EmptyState` 默认 `maw=400`。
7. i18n：`public/locales/{en,zh}` 两处都要加 key，仓库无类型校验，漏加会直接显示 key 字符串。
8. 跳「编辑图表」需复用 `EditChartMenuItem` 的 `storeDashboard` 逻辑（`belongsToDashboard` 时），
   否则看板未保存改动会丢。

## 6. 明天开工 checklist

- [ ] 确认范围：只做 P0（Explore + 移动端），还是 P0+P1（含看板）
- [ ] 取一个真实坏图（字段被删/改名）作为验收样本，记录 uuid
- [ ] 落 `ChartErrorDetails` 组件 + `context` 增加 `unsavedMetricQuery`
- [ ] `LightdashVisualization` 错误分支接线（用 `EmptyState` 的 `children`）
- [ ] `MinimalSavedExplorer` 接入 `apiErrorDetail`（含 minimal 降级）
- [ ] zh/en 文案补齐
- [ ] 加单测：失效字段检测、有/无 itemsMap 两种渲染、minimal 降级
- [ ] 手工回归：EditChartMenu 跳转、embed 不泄露字段、tile 小尺寸布局

## 7. 相关链接

- 列配置误清空的止血修复：`docs/visualization/table-ux-optimization-plan.md`（同目录，列宽/表头批次）
- 后端字段改名迁移：`packages/backend/src/services/RenameService/`（未覆盖 `merge` / `saved_sql` / `DATA_APP_VIZ`）
