# 看板导出改造：Tab 筛选器生效 + 筛选器常量列 + 布局收口（实施说明）

状态：**已实施**。common / backend / frontend / i18n 均已落地，验证命令与结果见 §5。
分支：`feat/dashboard-xlsx-export`。相关历史方案见 `dashboard-xlsx-export-plan.md`。

## 1. 背景与目标

客户反馈（宁卓）：

1. 导出弹窗里「XLSX 输出」三选一没有存在价值 → **只保留「每个 Tab 一个文件（ZIP）」**，且不再在界面上展示这个选项。
2. 导出的数据只有指标列（例：`集团 / 本期市场份额 / 市场份额增长`），看不出这行属于哪个时间、哪个类目。
   - 根因：**导出链路完全没有应用 Tab 筛选器**（后端只用 `dashboard.filters` 全局筛选器），
     时间类筛选器通常挂在 Tab 上，所以「康师傅」会出现在所有时间维度上。
   - 诉求：导出的每个表前面带上该 Tab 生效的筛选器（时间、类目等）作为常量列。

确定的行为口径：

| 项 | 决定 |
|---|---|
| 布局选项 | 彻底移除：`SchedulerCsvOptions.xlsxFileLayout` 字段删除，界面不再展示，产物固定「每个 Tab 一个文件（ZIP）」 |
| 旧值兼容 | 不需要。该布局选项从未上线，不存在历史交付数据；旧 JSON 里残留的键会被忽略 |
| 筛选器 | 导出按「全局 + 该 Tab」合并后生效，并按 tile 收敛（与页面查询一致） |
| 筛选器列 | 每张图/每个 CSV 的行首追加若干常量列，列名=筛选器名，值=该筛选器取值 |
| CSV / XLSX | 两者行为一致 |

## 2. 已完成：common 层（共享契约）

新增 `packages/common/src/utils/dashboardExportFilters.ts`（已导出到 `@lightdash/common`，含 23 个单测）：

```ts
EMPTY_DASHBOARD_FILTERS
mergeDashboardFiltersForTab({ globalFilters, tabFilters, isGlobalFilterEnabled, isTabFilterEnabled })
getDashboardFiltersForTab({ dashboard, tabUuid, globalFilters? })  // 开关缺省视为开启
getDashboardFiltersForTile({ filters, tileUuid })                  // 按 tileTargets 收敛
formatDashboardFilterRuleValue(rule): string | null                // 动态日期会解析成具体区间
getExportFilterColumns({ filters, itemMap? }): ExportFilterColumn[] // { header, value }，自动去重列名
```

`packages/common/src/types/scheduler.ts` 新增：

```ts
// 布局选项从类型里整体删除：SchedulerCsvOptions 不再有 xlsxFileLayout
export type ExportFilterColumn = { header: string; value: string };  // 定义在 utils 里
// 请求/任务载荷新增
ExportCsvDashboardPayload.tabFilters?: Record<string, DashboardFilters>;
ExportContentPayload.tabFilters?: Record<string, DashboardFilters>;
ExportContentRequest.tabFilters?: Record<string, DashboardFilters>;
DownloadAsyncQueryResultsPayload.leadingColumns?: ExportFilterColumn[];
```

`tabFilters` 语义：**每个 Tab 实际生效的完整筛选器**（已包含全局那一层），键为 `tabUuid`。
前端导出时带上页面当前取值；缺省时后端用 `getDashboardFiltersForTab` 按看板保存的定义合并。

## 3. backend 改动（packages/backend/src）

### 3.1 每个 tile 用「该 Tab 的筛选器」

`packages/backend/src/scheduler/SchedulerTask.ts` → `getNotificationPageData`（dashboard 分支，约 540-800 行）：

- 现有 `dashboardFilters = dashboard.filters`（+ scheduler filters 覆盖）保留，作为**全局层**。
- 新增按 Tab 解析：
  ```ts
  const tabFiltersByUuid = payload/tabFilters（若调用方传入）;
  const filtersForTab = (tabUuid: string | null): DashboardFilters =>
      tabUuid && tabFiltersByUuid?.[tabUuid]
          ? tabFiltersByUuid[tabUuid]
          : tabUuid
            ? getDashboardFiltersForTab({ dashboard, tabUuid, globalFilters: dashboardFilters })
            : dashboardFilters;
  ```
- 每个图表 tile 再收敛 `getDashboardFiltersForTile({ filters, tileUuid })`，把结果传给
  `executeAsyncDashboardChartQuery`。
- SQL 图 tile 传的是该 Tab 的筛选器（不预先按 tile 收敛）：`AsyncQueryService` 内部会用
  `getDashboardFilterRulesForTileAndReferences` 按 `tileUuid` + SQL 列引用收敛，一般筛选器不满足条件而失效，
  所以 SQL 图既不额外输出筛选器列，也不依赖调用方的预收敛。
- 交付链路（定时交付）没有前端状态，`tabFilters` 缺省 → 走 `getDashboardFiltersForTab` 的保存值合并。

`packages/backend/src/services/CsvService/CsvService.ts`：

- `getCsvsForDashboard` 增加 `tabFilters?: Record<string, DashboardFilters>` 参数，按 tile 计算同上，
  把 tile 级筛选器传给 `getCsvForChart`（它内部已经按 tile + tables 收敛）。
- `CsvService.scheduleExportCsvDashboard` → `ExportCsvDashboardPayload` → `runScheduledExportCsvDashboard` 链路透传 `tabFilters`；
  `packages/backend/src/routers/dashboardRouter.ts` 的 `POST /:dashboardUuid/exportCsv` 读 `req.body.tabFilters`。
- `packages/backend/src/scheduler/SchedulerTask.ts` 的 CSV 分支同样传入 `payload.tabFilters`。

### 3.2 筛选器常量列写入产物

- 在拿到该 tile 的生效筛选器后计算一次列：
  ```ts
  getExportFilterColumns({ filters: tileFilters, itemMap })  // itemMap 来自 explore
  ```
  XLSX 路径（`SchedulerTask.getNotificationPageData`）里 explore 通过
  `this.projectService.getExplore(account, projectUuid, chart.tableName)` 获取，按 tableName 用 Map 缓存；
  仅在该 tile 能算出非空列时才取 explore（`getExportFilterColumns({ filters }).length === 0` 直接返回空），
  `itemMap` 由 explore 与该图的 `metricQuery`（additionalMetrics / tableCalculations / customDimensions）构建。
  explore 拉取失败仅 `Logger.warn`，按空 `itemMap` 继续输出列（列名退回字段 id），
  且此时不再按 explore 的表范围收敛规则，避免静默丢列。
  时区（`lightdashConfig.query.timezone`）会传进 `getExportFilterColumns`，动态日期/相对时间按查询侧同一时区解析。
- 列名统一加前缀「筛选：」（英文 `Filter: `），与图表自带的数据列区分开；
  筛选器的字段本身已经出现在该图（`exportedFieldIds`）时**不再重复加列**
  ——例如「集团」既是 Tab 筛选器又是图表维度时，导出里只保留数据列。
- 取值用词跟随 UI 语言（`csvOptions.locale`，缺省中文）：`!=` → 「不是」，`>=` → 「大于等于」，
  区间 → 「start 至 end」，取反区间 → 「不在 start 至 end 内」，英文对应 `is not` / `>=` / `to` / `not between`。
- **SQL 图 tile 不输出筛选器列**：查询侧要求筛选器显式绑定到 SQL 列
  （`getDashboardFilterRulesForTileAndReferences` + `target.isSqlColumn`），一般筛选器都不满足，
  打印出来会变成「这行属于某时间窗」的假信息；SQL 图的查询本身也不受这些筛选器影响。
- 把这些列透传到下载链路：

| 位置 | 改动 |
|---|---|
| `AsyncQueryService.downloadAsyncQueryResults` / `downloadSyncQueryResults` | 透传 `leadingColumns` |
| `ExcelService.downloadAsyncExcelDirectly` | `options.leadingColumns`：`worksheet.columns` 头部插入这些列，`worksheet.addRow([...values, ...rowData])` |
| `ExcelService.downloadAsyncPivotTableXlsx` | 对 `pivotResultsAsCsv` 的每一行前置（与 CSV 同一口径）：第 1 行写 header，其余行写值；列宽采样按前置列数偏移 |
| `CsvService.writeRowsToFile` → `streamObjectRowsToFile` | 新增 leading 头 + 每行前置值 |
| `AsyncQueryService.downloadAsyncQueryResultsAsFormattedFile` | 透传 `leadingColumns` |
| `PivotTableService.downloadPivotTableCsv` / `downloadAsyncPivotTableCsv` | 同上，前置到透视矩阵左侧 |

透视表的表头是多行，**统一做法：每个前置列在第 1 行写列名，其余所有行（含次级表头行）写取值**，
不做合并单元格。CSV/XLSX 保持同一份值。

### 3.3 产物形态收口（只留一种布局，单份产物不再套 zip）

- `SchedulerCsvOptions` 删除 `xlsxFileLayout`；`DEFAULT_XLSX_FILE_LAYOUT` / `normalizeXlsxFileLayout` / `XlsxFileLayout` 一并删除。
- `SchedulerTask.getNotificationPageData`：`keepTempFile` 固定为 true（每张图先落 `/tmp`），
  查完之后无条件走 `buildPerTabWorkbookCsvUrls`（每 Tab 一个 xlsx）。
- **单份产物不套 zip**：只有一份工作簿时（看板没有 Tab，或只选了 1 个 Tab）直接返回该 `.xlsx`；
  ≥2 个 Tab 才打成 zip。CSV 的判据是「只有一张图有数据」（CSV 不按 Tab 合并，只能按文件数判断），
  否则打 zip。
- 空产物（筛选后无任何数据 / 所有 Tab 都合不出 sheet）统一抛 `No charts to export in the selected tabs`，
  不再产出空 zip；CSV 与 XLSX 前端都会把它映射成可读文案。
- **无 Tab 的看板**：产物文件名为看板名（不是「未分组 / Ungrouped」），因为这时候「一页 = 整个看板」；
  多 Tab 看板里混入无归属图时仍叫「未分组」以便区分。
- 空产物直接报 `No charts to export in the selected tabs`（前端映射成可读文案），不再产出空 zip。
- `SchedulerTask.exportContent`：不再按布局分支，直接把 `page.csvUrls[0]`（zip）透传。
- 删除死代码：单文件多工作表布局的合并入口 `buildWorkbookCsvUrls`（`WorkbookExportHelper.createWorkbookFile`
  仍在用，服务 per-tab 合并）、`generate-api` 里 `SchedulerCsvOptions` 的 `xlsxFileLayout` 定义。
- `DashboardService.scheduleExportContent` 把 `data.tabFilters` 写进 payload，options 不再带布局字段。

### 3.4 批量全量导出加固（额度 / 超时 / 进度）

单张图有自己的上限（CSV 受 `csvCellsLimit`、XLSX 受 `EXCEL_ROW_LIMIT`、透视受 `exportMaxPivotCells`），
但一个看板十几张图叠加没有边界，所以一键导出额外加了三道保护：

| 项 | 做法 | 配置 |
|---|---|---|
| 累计行数额度 | `ExportRowBudget`：每张图写完统计真实行数（XLSX 用 `streamJsonlToExcelFile` 的计数、透视按输入行数、CSV 用实际行数），累计超限即整次导出失败（不产出半截文件，已落盘的 `/tmp` 中间文件会被清理），前端把错误换成本地化文案并带出「已导出 N 行 / 上限 M 行」 | `DASHBOARD_EXPORT_MAX_TOTAL_ROWS`（默认 500000，`/health` 透出） |
| 产物体积额度 | `ExportSizeBudget`：按最终写出的 xlsx（每 Tab 合并完成后 `stat` 累加）与未压缩 CSV 体积累加；超限整次失败并清理中间文件，前端提示「产物约 N MB，上限 M MB」 | `DASHBOARD_EXPORT_MAX_TOTAL_BYTES`（默认 300MB，`/health` 透出） |
| 任务超时 | 仅 `EXPORT_CONTENT` 与 `EXPORT_CSV_DASHBOARD` 用更长的超时；前端轮询这两个任务放宽到 35 分钟 | `SCHEDULER_EXPORT_JOB_TIMEOUT`（默认 30 分钟） |
| 进度 | `scheduler_log.details.progress = { done, total, currentTabName, currentChartName }`，XLSX 与 CSV 两条链路都上报；前端导出 toast 实时显示「3/14 · Tab 名 · 图表名」 | — |

超时仍然是 `Promise.race`：只中止等待并标记失败，**不会中断后台正在跑的导出**（与本轮之前一致，属已知取舍）。
CSV 一键导出也补了并发限流（3）与同样的额度/进度，避免几十张图同时打满数仓。

**额度只对「用户点导出」生效**：定时交付（邮箱/Slack/Teams）走同一个 `getNotificationPageData` /
`getCsvsForDashboard`，但传 `enforceRowBudget: false`，保持原有的「按单图上限截断 + 失败清单」语义，
不会让存量交付突然整体失败。

## 4. frontend 改动（packages/frontend/src）

### 4.1 导出弹窗：复用「导出数据」的选项样式

`components/common/modal/DashboardExportModal.tsx` 改成与图表「导出数据」同一套控件：

```
导出看板
[数据] [图片]                ← 仅当实例启用 headless browser 才出现顶层页签
  选项卡（包含所有选项卡 / 多选）
  文件格式：CSV | XLSX
  值：格式化 | 原始
  限制：表格结果 | 所有结果 | 自定义 (+ 行数输入)
  灰底提示（按所选限制/格式给出口径）
  [取消] [下载]
```

- 选项控件抽成 `components/ExportResults/ExportOptions.tsx` + `useExportLimitDefaults`，
  与图表导出共用（「限制」区域仍按 `ChangeCsvResults` 权限展示，默认值规则一致：
  client-use 且无权限 → 全部结果）。
- 两种格式都走同一个接口 `POST /dashboards/:uuid/exports`（`format: csv | xlsx`），
  `options` 为 `{ formatted, limit: 'table' | 'all' | number, locale }`；
  旧的一键 CSV 接口 `/dashboards/:uuid/exportCsv` 前端不再调用（后端保留）。
- 导出中 toast 会实时刷新进度；`truncated` 提示、按 `fileType` 补扩展名的下载名逻辑保留。

### 4.2 i18n

新增：`tabs.data`、`table_limit_hint`、`hooks_dashboard.export_progress*`、
`export_row_limit_exceeded`、`export_timeout`；删除只属于旧弹窗的 `xlsx_hint` / `csv_hint` /
`tooltip.*` / `tabs.csv` / `tabs.xlsx`，日期缩放提示不再写死「CSV」。

## 5. 已实施与验证

实现按 §3 / §4 落地，关键行为已逐条对照代码核对：

| 行为 | 代码位置 |
|---|---|
| Tab 筛选器合并 / tile 收敛 / 列生成（含同名列去重） | `packages/common/src/utils/dashboardExportFilters.ts` |
| 导出按「全局 + Tab」合并、按 tile 收敛；`tabFilters` 缺省时按看板保存值合并 | `SchedulerTask.getNotificationPageData`、`CsvService.getCsvsForDashboard` 的 `getFiltersForTab` |
| 筛选器常量列：XLSX 前置到 sheet 最左（透视表首行列名、其余行取值），CSV 前置到行首 | `ExcelService.streamJsonlToExcelFile` / `downloadAsyncPivotTableXlsx`、`CsvService.writeRowsToFile → streamObjectRowsToFile`、`PivotTableService.prependLeadingColumns` |
| `leadingColumns` 随下载链路透传（含透视 CSV / 透视 XLSX） | `AsyncQueryService.downloadAsyncQueryResults` / `downloadSyncQueryResults`、`ExcelService`、`PivotTableService` |
| 布局收口：布局字段与 `zip` / `workbook` 分支整体删除，产物固定「每 Tab 一个 xlsx → zip」 | `SchedulerTask.exportContent` / `getNotificationPageData` / `buildPerTabWorkbookCsvUrls`、`DashboardService.scheduleExportContent`、`common/src/types/scheduler.ts` |
| 前端布局选项移除，`tabFilters` 随 CSV / XLSX 请求带上 | `DashboardExportModal.tsx`、`SchedulerForm.tsx`、`useDashboard.ts`、`dashboardRouter.ts` |
| `tabFilterEnabled` 在看板加载时回填（页面与交付/导出口径一致） | `providers/Dashboard/DashboardProvider.tsx` |
| 单份产物直接给 xlsx / csv，多份才 zip；无 Tab 看板用看板名 | `SchedulerTask.buildPerTabWorkbookZipUrl` / `exportContent`、`CsvService.runScheduledExportCsvDashboard` |
| 筛选器列名加「筛选：」前缀、同字段不重复加列；取值用词按 locale | `common/utils/dashboardExportFilters.ts`、`SchedulerTask.getExportedFieldIds` |
| 累计行数额度（超限整体失败） | `backend/utils/FileDownloadUtils/exportBudget.ts`、`SchedulerTask` / `CsvService` |
| 导出任务专属超时 + 前端 35 分钟轮询 | `parseConfig.scheduler.exportJobTimeout`、`SchedulerWorker`、`useDashboard.ts` |
| 进度带 Tab / 图表名 | `SchedulerTask.reportExportProgress`、`CsvService.getCsvsForDashboard(onProgress)`、`useScheduler.pollJobStatus(onProgress)` |

实际执行的验证命令与结果（backend 三份 jest 在文档核对时复跑确认）：

| 命令 | 结果 |
|---|---|
| `pnpm -F common test -- src/utils/dashboardExportFilters.test.ts` | 25 passed |
| `pnpm -F backend test -- src/services/CsvService/CsvService.stream.test.ts` | 7 passed |
| `pnpm -F backend test -- src/services/ExcelService/ExcelService.stream.test.ts` | 1 passed |
| `pnpm -F backend test -- src/services/PivotTableService/PivotTableService.csv.test.ts` | 5 passed |
| `pnpm -F backend test -- src/utils/FileDownloadUtils/exportBudget.test.ts` | 4 passed（额度累计/超限抛错/文案数值） |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm -F backend typecheck` | 通过，无错误 |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm -F frontend typecheck` | 通过，无错误 |

（按独立 review 意见补了：SQL 图 tile 不写筛选器列、相对时间解析成区间、透视 XLSX 与 CSV 列位一致、
筛选器列名补 `fieldLabel` / 表计算 `displayName` 回退、时区透传；common 单测同步扩到 23 个。）

## 6. 已知取舍（实现口径）

- 透视表的前置列不参与合并单元格，多行表头里列值会重复出现（可读性优先于版式）；
  透视 XLSX 与透视 CSV 的列位一致（第 1 行是筛选器列名）。
- 「所有结果」在整看板导出里受两道约束：单图各自的硬上限（CSV `csvCellsLimit` / XLSX `EXCEL_ROW_LIMIT`）+
  整次导出的累计行数额度（默认 50 万行，跨所有图表累加）；超额度是整体失败，不会产出半截文件。
  注意粒度差异：单图单独「导出数据」XLSX 仍可到 100 万行，但看板级总和仍受 50 万行 / 300MB 约束。

实测体积参考（exceljs 流式写、`useSharedStrings:false`，含 4 个文本列）：

| 表形状 | 字节/行 | 50 万行产物 | 100 万行产物 |
|---|---|---|---|
| 8 列 | ~51 B | ≈ 25 MB | ≈ 49 MB |
| 15 列 | ~110 B | ≈ 52 MB | ≈ 105 MB |
| 30 列 | ~234 B | ≈ 112 MB | ≈ 223 MB |

所以默认值下「一次看板导出」的体积上限就是 **300 MB**（行数与列数都受限时通常只到 50–110 MB），
`/tmp` 峰值按「当前 Tab 合并文件 + 最终 zip」估 ≈ 2× 产物大小，部署建议给 `/tmp` 留 ≥ 2 GB。
- 导出任务超时只中止等待、不中断后台执行（后台仍会跑完并清理 `/tmp`）；
  额度护栏的作用是让大导出更早失败，尽量不撞到超时。
- 相对时间筛选器（近 N 个月 / 本月 / 未来 N 周）按查询侧口径解析成具体 `start ~ end` 再导出，
  不会输出裸数字；`fromStartToLatestMonth` 的「最新可用月」上界由查询侧按数据可用日动态决定，
  导出列只写解析出的起始侧区间，可能与查询上界差一个月（显示口径，不影响查询）。
- 一次性导出由前端对**所有 Tab** 生成当前合并结果（含未保存的临时改动）随请求带上；
  `tabFilters` 缺省（定时交付等无前端状态的链路）时，后端用 `getDashboardFiltersForTab` 按看板保存的定义合并。
- Tab 筛选器的临时改动（未保存）通过 `tabFilters` 载荷传递，不再依赖后端重算。
- CSV 链路里的 SQL 图（`CsvService.getCsvForSqlChart`）与 XLSX 链路的 SQL 图 tile 都不接收看板筛选器，
  因此既不受 Tab 筛选器约束、也不带筛选器列（改动前 CSV 就已经如此）。若后续要补，需要先把看板筛选器
  接进 `getCsvForSqlChart` / 让 SQL 图支持绑定筛选器列。
- `worksheet` 左侧新增列会影响列号（A、B… 变为第 N+1 列起）；依赖固定列号的下游脚本需要按列名取数。
- 旧 JSON 里残留的 `xlsxFileLayout` 键不再读取（该选项从未上线，没有历史交付需要兼容）。
- 产物类型由 URL 对象键后缀判断（`.zip` → zip，否则 xlsx/csv），与邮件附件同一判据；
  job `details` 里同时带 `fileType` 与 `truncated`，前端下载名按 `fileType` 补扩展名（以前是无扩展名，
  取决于浏览器推断），`truncated` 为真时成功 toast 追加提示。
- 邮件「作为附件」改为从所有有产物的条目构建：合并后的产物只有一条，任意一张图触顶就会把整条标成
  `truncated`，若按 truncated 过滤会出现「勾了附件却没有附件」；截断仍由模板的 truncated 区块提示。
- zip 条目名去重改为大小写不敏感（Windows/macOS 解压会互相覆盖），非法字符与空名仍走
  `sanitizeGenericFileName`（空名 → `download`）。
