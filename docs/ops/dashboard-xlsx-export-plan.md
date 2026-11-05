# 一键导出整个看板数据（按 Tab 分 Excel、按图分 Sheet）方案

状态：三种布局（每图一文件 / 单文件多工作表 / 按 Tab 分文件）已实现，**暂不上线**；上线前需先修 §8 的 P0/P1。分支 `feat/dashboard-xlsx-export`。

## 1. 需求

客户在衡石上有一个"一键下载整个看板全部数据"的功能，使用频率较高。期望的产物形态（客户给的实际样例）：

```
品类洞察（MSY150均衡模型）方便速食 V1.7 2026-06-11 15-50-42.zip
├── 集团深度分析（二级类目）.xlsx      1.2 MB
├── 集团深度分析（三级类目）.xlsx      7.2 MB
├── 集团深度分析（四级类目）.xlsx     16.4 MB
├── 品类规模趋势.xlsx                  1.2 MB
├── 品类机会洞察（三级类目）.xlsx      0.4 MB
├── 品类机会洞察（四级类目）.xlsx      0.04 MB
├── 品类省份洞察（四级类目）.xlsx      1.1 MB
├── 品牌深度分析（三级类目）.xlsx      7.6 MB
└── 品牌深度分析（四级类目）.xlsx     88.8 MB
```

也就是：zip 里 **每个 Tab 一个 xlsx**，每个 xlsx 里 **每个图一个 sheet**。

## 2. 现状（比预想的完整，先避免重复造）

前端已经有一个「导出看板」弹窗，包含 CSV 与 XLSX 两个页签，XLSX 页签支持勾选 Tab、选择文件布局：

- `components/common/modal/DashboardExportModal.tsx`：`CsvExport` 与 `XlsxExport` 两个组件；XLSX 走 `useExportDashboardContent`，请求体里带 `format: xlsx`、`selectedTabs`、`xlsxFileLayout`
- `xlsxFileLayout` 类型在 `common/src/types/scheduler.ts:19`，取值 `'zip' | 'workbook'`

后端有两套产出：

- CSV：`CsvService.getCsvsForDashboard`（`CsvService.ts:909`）按 tile 逐个生成 CSV，`SchedulerTask.exportContent` 打成 zip
- XLSX：`SchedulerTask.getNotificationPageData`（约 `SchedulerTask.ts:540-700`）
  - 逐 tile 调 `asyncQueryService.executeAsyncDashboardChartQuery` + `downloadSyncQueryResults` 生成单图 XLSX（异步路径，结果经 `query_history` 的 JSONL）
  - `xlsxFileLayout === 'workbook'` 时调 `WorkbookExportHelper.createWorkbookFile` 合并成一个多 sheet 工作簿
  - 否则打成 zip（每 tile 一个 xlsx）
- `WorkbookExportHelper`（`services/ExcelService/WorkbookExportHelper.ts:108`）已经处理了 sheet 命名去重、逐行复制单元格值与 `numFmt`、单文件失败跳过

所以"每个图一个 sheet"这件事已经有实现，缺的是**按 Tab 分组**。

## 3. 与目标形态的差异

| 差异 | 现状 | 目标 |
|---|---|---|
| 分组 | 整个看板一个 workbook，或每 tile 一个文件 | 每个 Tab 一个 xlsx |
| 合并方式 | `new Excel.Workbook()` 读入所有 sheet 再 `writeFile`，非流式 | 建议流式写入，避免大看板内存峰值 |
| 并发 | 所有 tile 一起 `Promise.allSettled`，20+ 图同时查数仓、同时生成 xlsx | 需要并发上限 |
| 进度 | 只有任务状态轮询，没有百分比 | 建议按 tile 上报进度 |
| 上限 | 单 sheet 受 `EXCEL_ROW_LIMIT`（100 万行）约束，zip 体积无上限 | 需要总行数/体积上限与失败清单 |

样例里单个 xlsx 到 88 MB，说明真实场景下"一个 Tab 的几张图"合起来就可能几百 MB，内存与超时都要提前设计。

## 4. 方案 A：按 Tab 分组（最小改动，先满足需求）

**做法**

1. 后端在 `exportContent` 的 XLSX 分支里，按 `tile.tabUuid` 把 `page.csvUrls` 分组（`csvUrls` 目前是扁平数组，需要带上 `tabUuid`；`getNotificationPageData` 里遍历 tile 时就能拿到）。
2. 每组调一次 `WorkbookExportHelper.createWorkbookFile` 生成一个 workbook，sheet 名用图名（现有逻辑）。
3. 把 N 个 workbook 用现有 `createExportZipDownloadUrl` 打成 zip，条目名 `<Tab 名>.xlsx`。
4. `xlsxFileLayout` 增加一个取值（如 `'per-tab-workbook'`），前端弹窗加对应选项，默认仍用现有行为。

**改动点**

- `SchedulerTask.getNotificationPageData`：`csvUrls` 元素补 `tabUuid`、`tabName`
- `SchedulerTask.exportContent` 的 XLSX 分支：按 tab 分组 + 多次合并 + 打包
- `common/src/types/scheduler.ts`：`xlsxFileLayout` 增加取值
- `DashboardExportModal.tsx`：多一个布局选项

**产出命名**

样例是平铺的 `<Tab 名>.xlsx`。需要注意 Tab 名重复或为空时的去重，以及文件名里 `/ \ : * ? " < > |` 的清洗（`sanitizeGenericFileName` 已有）。

**工作量与风险**

后端 2–3 人日、前端 0.5 人日。风险集中在内存：现有合并是非流式的，一个 Tab 里如果几张图都很大，`new Excel.Workbook()` 会把它们全部读进内存。建议先在方案 A 里加一个"单 Tab 总行数/总大小超限则降级为逐 tile 文件"的保护。

## 5. 方案 B：性能与稳定性（第二阶段）

方案 A 解决形态，方案 B 解决"能不能跑完"。

1. **流式写 sheet**：不先生成 N 个 xlsx 再合并，而是在 `WorkbookWriter` 里逐 sheet 写入并 `worksheet.commit()`。已在本地用 exceljs 验证过可行性：3 个 sheet × 5000 行耗时 319 ms，中文与括号的 sheet 名保留正常，首表与末表的值都能读回。改造点是 `ExcelService.streamJsonlToExcelFile`（现在一个 workbook 只写一个 sheet，需要把 worksheet 作为参数传入）。
2. **并发上限**：tile 级并发控制在 2–3，避免 20 张图同时打数仓。看板越大越需要。
3. **进度**：每完成一个 tile 往 `scheduler_log.details` 写 `{ done, total, currentSheet }`，前端轮询时显示百分比。现有的任务状态接口已能带 `details`。
4. **失败与上限**：失败的 tile 不中断整体，最终在一个 "导出说明" sheet 里列出失败图名与原因；单 sheet 行数沿用 `EXCEL_ROW_LIMIT`，zip 总体积给一个上限（超过则停止并提示）。
5. **超时**：一个 10 Tab、几十张图、总量几百 MB 的导出，20 分钟的 `SCHEDULER_JOB_TIMEOUT` 大概率不够，需要评估是否对这类任务单独设更长的超时，或者按 Tab 拆成多个子任务并行。

工作量 5–8 人日。

## 6. 待确认

1. 空 Tab 或无数据的图怎么处理：生成只有表头的 sheet，还是跳过。
2. 非表格类 tile（大数字、折线图）要不要导出：它们的 metric query 同样有结果集，导出的是原始结果行，不是图上展示的聚合点；需要和业务确认这是否符合预期。
3. 透视表 tile：导出透视后的形态（列展开）还是未透视明细。现有单图导出两种都有，需要选一种。
4. Markdown / 图片 / iframe tile：没有数据，直接跳过并在说明里列一行。
5. 是否只导出当前用户有权限看到的 tile，以及 Tab 内被隐藏的图是否包含。

## 7. 排期与验收

| 阶段 | 内容 | 预估 |
|---|---|---|
| A | 按 Tab 分组 + 打包 + 前端选项 | 后端 2–3 人日、前端 0.5 人日 |
| B1 | 流式多 sheet 写入（去掉二次合并） | 2–3 人日 |
| B2 | 并发上限 + 进度上报 | 1–2 人日 |
| B3 | 失败清单 + 体积/行数上限 | 1 人日 |

验收：

- 产物结构与样例一致：zip 条目数 = 选中的 Tab 数；每个 xlsx 的 sheet 数 = 该 Tab 下可导出的图数
- 单个 sheet 的列与单图导出一致（列顺序、表头、数值格式），可用同一张图做逐单元格对比
- 失败 tile 有明确提示，不静默丢数据
- 20 图 / 300 MB 规模下不 OOM、不超时（或超时前给出可读的失败原因）

## 8. 三种布局对照与已知问题（2026-11 核对）

前端弹窗与定期交付表单共用同一组 `xlsxFileLayout` 取值，文案按「文件怎么分」表述，避免「工作簿/工作表」术语门槛：

| 选项（zh） | 取值 | 产物 | 结构 |
|---|---|---|---|
| 每张图一个文件（ZIP） | `zip`（默认） | 1 个 zip | 每图一个 xlsx，每个文件 1 张表 |
| 单个文件（每张图一个工作表） | `workbook` | 1 个 xlsx | 每图一张 sheet |
| 每个 Tab 一个文件（ZIP） | `per-tab-workbook` | 1 个 zip | 每 Tab 一个 xlsx，文件内每图一张 sheet |

三者查询阶段完全相同（每图一次 `invalidateCache: true` 重查），差异只在查询之后：
`zip` 不合并最省内存 → `per-tab` 串行逐 Tab 合并（峰值 = 最大 Tab）→ `workbook` 全部 sheet 一次进堆（峰值最高）。
所以默认保持 `zip`。

**已知问题（上线前必修）**

1. **P0 合并布局必失败**：`WorkbookExportHelper.loadSourceWorksheet` 用 `fetch(localPath)`，
   而 `keepTempFilesForMerge` 让 `localPath` 变成 `/tmp/*.xlsx`；Node fetch 不接受裸路径 →
   workbook / per-tab 两种布局在全部查询跑完后抛「All XLSX downloads failed」。
   `origin/dev` 上 `localPath` 是 https URL 所以未暴露。
2. **P1 临时文件泄漏**：`workbook` 布局把 `csvUrls` 换成单条 S3 URL 后，
   `cleanupLocalExportFiles` 只认本地路径，合并前的 N 个 `/tmp` xlsx 不会删；
   `buildPerTabWorkbookZipUrl` 的逐 Tab 写入循环也在 `try/finally` 之外。
3. **P2 并发上限不生效**：`mapWithConcurrencyLimit` 收到的是已经起跑的 promise + 恒等 mapper，
   实际并发 ≈ 图数，几十张图会同时打数仓。

**与 gzip 结果存储的关系**：无。`RESULTS_JSONL_GZIP` 只压缩结果 JSONL 的 S3 对象，
读时透明解压，xlsx 明文上传、presigned URL 直连下载，后端没有 `compression` 中间件，
ZIP 内 xlsx 条目本身用 `level: 0`（不再二次压缩）。

## 9. 复核结论与待办（2026-11 上线前审计）

三张审计报告（链路同步性 / gzip 影响 / 上线前清单）的结论：

- **异步性**：HTTP 只写 job 返回 `jobId`，前端 2s 轮询（上限 20min）；真正的导出在 graphile worker 里，
  默认与 API 同进程（拆进程方案暂不实现），所以大导出会拖慢同 pod 的其它请求。任务超时只是 `Promise.race`，不中断执行。
- **与 gzip 无关**：`RESULTS_JSONL_GZIP` 只压结果 JSONL 的 S3 对象，xlsx 明文上传、presigned 直链下载，
  后端无 `compression` 中间件，ZIP 内 xlsx 条目 `level: 0`，不存在二次压缩。

已修（本分支）：

| 项 | 内容 |
|---|---|
| P0 | 合并布局 `fetch('/tmp/...')` 必失败 → 按 scheme 分流走 `fs` |
| P1 | `workbook` 布局 /tmp 中间文件泄漏、per-tab 生成循环在 `try/finally` 外 |
| P0 | 定时交付里 `per-tab-workbook` 被静默忽略（只有内容导出走该分支） |
| P1 | `truncated` 恒为 false，截断信息不落交付；无 `tabUuid` 磁贴固定中文「未分组」 |
| P1 | 邮件附件把 zip 产物命名成 `.xlsx`（`asAttachment` 场景） |
| P1 | 交付表单就地改写 `DEFAULT_VALUES.options`，新建交付默认值被污染 |
| P2 | sheet 名去重区分大小写，与 Excel 的大小写不敏感唯一性规则冲突 |

仍待处理（不阻塞「暂不上线」，上线前再评估）：

1. **并发上限不生效**：`mapWithConcurrencyLimit` 收到的是已起跑的 promise + 恒等 mapper，实际并发 ≈ 图数。
2. **部分失败静默丢图**：`failedFileCount` 无人读取，交付里看不出「20 张成功 12 张」。
3. **zip 阶段全量 Buffer**：`createExportZipDownloadUrl` 对 http 输入 `fetch + arrayBuffer` 且全量并发，
   与本地路径的 `archive.file` 流式分支不一致；建议 `Readable.fromWeb` + 限并发。
4. **/tmp 峰值 ≈ 2× 产物**：合并布局的输入 + 合并结果 + level 0 的 zip 同时存在。
5. **透视 xlsx 不参与 `keepTempFile`**，合并时要回 S3 再拉；`copyWorksheet` 不复制合并单元格与冻结窗格。
6. **测试缺口**：per-tab 分组、tab 过滤、部分失败、同名去重、`EXPORT_CONTENT` 端到端都没有用例。
7. **0 图 / 空看板**报错文案不可读；workbook 合并后 analytics 的 `numCharts` 恒为 1。
8. **文案细节**：导出弹窗改为动态扩展名后，`components_common_modal_dashboard_export.tabs.xlsx` 已不被引用（可清理）；
   `xlsx_output_help` 的「三种方式内容相同」在按 Tab 分文件时严格说是「每个文件的内容分组不同」，措辞可再收紧。
