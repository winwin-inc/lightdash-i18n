# 大数据量导出（CSV / XLSX）慢与"转圈卡死"评估

**状态**：已调研（代码走查 + 本机微基准），**未实施**
**日期**：2026-11-03
**触发**：客户反馈「一个月数据 13.5 万行导出 8 分钟 / 转圈不动」「70 万行 1–2 分钟」「SPU 市占表（透视表）直接卡死」

---

## 0. 结论（先说能不能优化）

**能优化，且空间很大。** 现网导出慢**不是**数仓查询慢一个原因造成的，而是三段串行链路叠加了 4 个可修的工程问题：

| # | 问题 | 性质 | 量级（实测/推算） |
|---|---|---|---|
| R1 | 逐单元格构造 `Intl` 格式化器（数值 + 时区日期） | **纯 CPU 浪费，最常见的最大头** | 单格 14–57 µs，缓存后 0.4–1.6 µs → **20–36×** |
| R2 | 透视导出把全部行读进数组 → 全字段格式化 → 建 3 份矩阵 → 拼整串 → 再 `Buffer` 复制 | **内存 + 同步阻塞**（"卡死"主因） | 峰值 ≈ 5–6× 数据量；`formatRows` 占透视总耗时 **70–87%** |
| R3 | 导出默认"重跑一遍全量查询"（`Limit.ALL` + `limit=MAX_SAFE_INTEGER`） | 结构性浪费 | 首屏已查一次，导出再查一次 |
| R4 | 导出任务与 API **同进程**，CPU 段阻塞事件循环 | 体验灾难 | 导出期间**全站**排队，连状态轮询都答不上 |
| R5 | 前端轮询**无超时/无进度**，且 job 崩溃后状态永远停在 `started` | "永远转圈"的机制 | 只能刷新页面 |

按下面 P0 三件事（约 3–5 人日）预计可把「20 列 / 70 万行 / 格式化导出」从 **3–4 分钟降到 15 秒量级**，并把透视导出的"卡死"变成"数秒 + 不阻塞其他用户"。**这些数字需要按第 6 节的度量方式在生产验证。**

> 注意一个前提性事实：客户说的"限制显示可以下载 100 万条"是**前端写死的中文文案**，只对 XLSX 生效（`packages/frontend/public/locales/zh/translation.json:6900` → `"最多导出 1,000,000 行"`，对应后端硬编码 `ExcelService.EXCEL_ROW_LIMIT = 1_000_000`，`packages/backend/src/services/ExcelService/ExcelService.ts:37`）。**CSV 路径没有任何行数上限**（`CsvService.streamJsonlRowsToFile` 不传 `maxLines`），所以 13.5 万行 / 70 万行 CSV 能一路跑到底 —— 提示和实际限制口径不一致，也是"以为很快"的原因之一。

---

## 1. 现状链路（先看清时间花在哪）

点击「下载」后是**三段串行**，全程只有 1 个 loading toast，没有阶段、没有百分比、没有取消：

```
① 取 queryUuid（可能重跑一次全量查询）
   ExportResults/index.tsx:135-176 → useDashboardChartDownload.ts:70-110
   limit=ALL 时 → POST /projects/:p/query/dashboard-chart, limit=MAX_SAFE_INTEGER
   → AsyncQueryService.executeAsyncQuery (AsyncQueryService.ts:1769)
   → void this.runAsyncWarehouseQuery(...)   ← 在 API 进程主循环里跑 (AsyncQueryService.ts:2008)
      仓库流式取数 → 每行 JSON.stringify → S3 JSONL (S3ResultsFileStorageClient.ts:102-112)
   前端 pollForResults 轮询到 READY（250/500/1000ms 退避，永不放弃: executeQuery.ts:15-40）

② 投递导出任务 + 轮询 job 状态
   POST /projects/:p/query/:q/schedule-download → graphile job（Postgres 队列）
   前端每 2s 轮询 GET /api/v1/schedulers/job/:jobId/status
   （无超时/无次数上限: useScheduler.ts:263-294）

   job 内（SchedulerWorker 与 API 同进程: App.ts:272-273 / 1060-1072）：
   - 非透视：S3 JSONL → 逐行格式化 → CSV → 直接 multipart 写 S3（名义流式）
   - 透视：JSONL 全量收成数组 → 全量格式化 → pivot → 3 份矩阵 → 整串 → Buffer → S3
   - XLSX：exceljs 流式（非透视）/ 内存 workbook（透视）

③ 浏览器下载
   S3 模式：presigned URL 直连（不经 Lightdash）；本地模式：res.sendFile 流式
```

关键代码位置：

| 阶段 | 文件:行 |
|---|---|
| 导出入口（看板） | `packages/frontend/src/hooks/dashboard/useDashboardChartDownload.ts:70-110`、`components/ExportResults/index.tsx:127-209` |
| job 投递 | `packages/backend/src/controllers/v2/QueryController.ts:548-580`、`scheduler/SchedulerClient.ts:957-982` |
| 非透视 CSV | `services/AsyncQueryService/AsyncQueryService.ts:1053-1121` → `services/CsvService/CsvService.ts:412-490` |
| 透视 CSV | `services/PivotTableService/PivotTableService.ts:90-171`（收全量）、`177-241`（格式化+pivot+整串） |
| 逐格格式化 | `packages/common/src/utils/formatting.ts:223-248`（数值）、`services/CsvService/CsvService.ts:161-192`（时区日期） |
| 透视数据结构 | `packages/common/src/pivot/pivotQueryResults.ts:518-875`（索引/表头）、`224-372`（矩阵）、`1474-1564`（展平） |

---

## 2. 根因与证据

### R1 逐单元格构造 `Intl`（影响最大、最容易修）

`formatNumberValue` 每格调用 `value.toLocaleString(locale, options)`（`packages/common/src/utils/formatting.ts:223-248`）；`formatMomentByTimezone` 每格 `new Intl.DateTimeFormat(...)` + `formatToParts` + `Object.fromEntries`（`CsvService.ts:161-192`，`ExcelService.ts:145-166` 是同一份实现的副本）。导出时 `displayTimezone = lightdashConfig.query.timezone`（默认 `Asia/Shanghai`，`parseConfig.ts:2030`），所以**日期/时间戳列必然走最慢分支**。

本机微基准（Node 26，单线程）：

| 每格操作 | 现状 | 缓存后 | 倍数 |
|---|---|---|---|
| 数值 + 自定义格式（如 `usd`） | **20 µs** | 0.4 µs | ~30× |
| 日期/时间戳（时区，`formatToParts`） | **57 µs** | 1.6 µs | ~36× |
| 字符串维度 | 0.3 µs | — | — |

按 20 列（12 字符串 + 2 时间戳 + 1 日期 + 5 数值）推算：**约 400 µs/行 → 18 µs/行**；70 万行即 **3–4 分钟 → 12–15 秒**。这也解释客户"70 万行 1–2 分钟"：列少或部分列是字符串，成本低一些。

### R2 透视导出（"SPU 市占表卡死"）

`downloadAsyncPivotTableCsv` 先把整个 JSONL **收成数组**（`PivotTableService.ts:129-136`），随后：

1. `formatRows(rows, itemMap)` **对全部行、全部字段**格式化，且每格同时算 `raw` + `formatted`（`packages/common/src/index.ts:1636-1666`）→ 只用一份，白算一半；
2. `pivotResultsAsCsv` → `pivotQueryResults` 建 3 份 `行 × 列` 的全量结构（`dataValues`、`retrofitData.allCombinedData`、字符串矩阵）；
3. `stringify(整个数组)` 拼成**一个完整 CSV 字符串**（`PivotTableService.ts:220-233`）；
4. `Buffer.concat([BOM, Buffer.from(csv)])` **再复制一份**（`:259-263`）；
5. `uploadCsv(buffer)` 整块上传。

实测形状采样（本机，合成数据）：

| 输入 | 透视输出 | `formatRows` | pivot 三件套 | stringify |
|---|---|---|---|---|
| 4 000 行 × 7 列 | 1 503 × 74 | **208 ms** | 40 ms | 19 ms |
| 20 000 行 × 7 列 | 1 503 × 122 | **1 015 ms** | 139 ms | 37 ms |
| 60 000 行 × 7 列 | 15 003 × 32 | **3 552 ms** | 535 ms | 136 ms |

→ 全程**同步、无 yield、无 worker**，`rowTotals`（市占表常态）还会引入 O(行 × 指标 × 列) 的额外遍历（`pivotQueryResults.ts:773-830`）。

⚠️ 关键细节：透视导出实际被截断到 `floor(csvCellsLimit / 字段数)` 行（`PivotTableService.ts:124-135`，`csvCellsLimit` 默认 **100000**）。所以"透视表卡死"**不一定是行数极大**，更可能是**列很宽（`pivotDimension` 基数大 → 列数暴涨）+ 全量物化 + 同步阻塞**。要区分「前端 VTable 渲染卡」还是「导出卡」，见第 6 节。

### R3 导出默认"再查一遍全量"

`useDashboardChartDownload` 在 `Limit.TABLE` 时复用首屏的 `queryUuid`（**不重查**），但 `Limit.ALL` / `Limit.CUSTOM` 会重新发起异步查询（`useDashboardChartDownload.ts:88-107`），且 `limit = MAX_SAFE_INTEGER` → SQL 变了 → 缓存 key 变了 → **必然 miss**。受限角色（`isClientUse` 且无 `ChangeCsvResults` 权限）默认就是 `Limit.ALL`（`ExportResults/index.tsx:104-113`），即**这类客户每次导出都在重跑全表**。

### R4 导出任务与 API 同进程

`App.ts:272-273` 在 API 进程里启动 `SchedulerWorker`（`SCHEDULER_ENABLED` 默认 true，`SCHEDULER_CONCURRENCY` 默认 3，`parseConfig.ts:2084-2085`）。R2 的同步 CPU 段一跑，**API 事件循环整段停摆**：页面、状态轮询、其他人的查询一起排队 → 用户体感就是"卡死"。同时 `tryJobOrTimeout` 的 10 分钟兜底（`parseConfig.ts:1416`）也因事件循环被堵而**无法准时触发**。

### R5 "永远转圈"的机制

- 前端 `pollForResults`（`executeQuery.ts:15-40`）与 `getJobStatus`（`useScheduler.ts:263-294`）**都没有超时/最大次数**。
- job 的终态只能由任务内 `logWrapper` 写（`scheduler/SchedulerTask.ts:1845-1884`）；进程被 OOM/重启打断时 catch 执行不到 → `scheduler_log` **永远停在 `started`**。
- 兜底事件 `job:failed` 只打日志、不写库（`scheduler/SchedulerWorkerEventEmitter.ts:113-116`）；`SCHEDULED_JOB_MAX_ATTEMPTS = 1`（`scheduler/SchedulerClient.ts:55`）→ 不重试、也没人补写终态。
- 另外：`details.fileUrl` 为空时 `link.href = undefined`，`link.click()` **静默失败**（`components/ExportResults/index.tsx:178-190`）→ "转圈结束但什么都没发生"。

可直接验证是否已经发生过（只读 SQL）：

```sql
-- 长时间停留在 started 的孤儿 job（= 进程中途死掉的证据）
SELECT job_id, task, status, created_at
FROM scheduler_log
WHERE status = 'started' AND created_at < now() - interval '30 minutes'
ORDER BY created_at DESC;
```

### R6 结果分页线性重扫（顺带的"看板也慢"）

`getResultsPageFromS3`（`AsyncQueryService.ts:296-378`）每次翻页都**从文件第 0 行读起**、`JSON.parse` 到目标页为止。70 万行 / 每页 500 → 翻到第 100 页要扫 5 万行，是 O(n²) 累计开销。

### R7 背压缺失（内存风险）

- `S3ResultsFileStorageClient.createUploadStream` 的 `write()` 用 `passThrough.push(...)` 且**丢弃返回值**（`S3ResultsFileStorageClient.ts:102-112`）→ S3 上传慢时缓冲无上界增长；
- `CsvService.streamJsonlRowsToFile` 是手写 pump，`stringifier.write()` 的返回值无人看（`CsvService.ts:437-490`），收尾用 `'finish'` 而非 `'end'`；隔离复现中「慢速 sink」场景会丢行或挂住 —— **按正确性风险处理**，修法就是照抄 `streamObjectRowsToFile` 的 `pipeline` 写法（`CsvService.ts:340-405`）。

### R8 无压缩 + 老路径整份读回

- 全链路无 gzip（`App.ts` 只对静态资源用 `expressStaticGzip`），JSONL/CSV 明文落 S3、明文回读。
- 遗留 v1 同步路径（`CsvService.downloadCsv` / `getCsvForChart`）在 S3 上传前把整份 CSV `readFile(..., 'utf-8')` 成字符串再 `Buffer.from + Buffer.concat`（`CsvService.ts:824-830`、`1303-1306`）→ 峰值约 **3× 文件大小**，全部同步。v1 端点仍存活（`exploreController.ts:180-227`、`savedChartController.ts:400-446`），脚本/旧前端仍可能命中。

---

## 3. 优化方案（按性价比排序）

### P0 —— 先做这三件（1 周内可上线，收益最大）

| # | 改动 | 落点 | 预期收益 | 风险 |
|---|---|---|---|---|
| **P0-1** | **给 `Intl` 加记忆化**：`formatNumberValue` 按 `locale + options` 缓存 `Intl.NumberFormat`；`formatMomentByTimezone` 按 `timeZone + pattern` 缓存 `Intl.DateTimeFormat` 并改用 `format()` 直接出串（去掉 `formatToParts` + `Object.fromEntries`）；顺带把 `CsvService` / `ExcelService` 两份重复实现合并 | `packages/common/src/utils/formatting.ts:223-248`、`CsvService.ts:161-192`、`ExcelService.ts:145-166` | 单格 20 µs→0.4 µs、57 µs→1.6 µs；整体导出 **-55%~-80%**（70 万行 3–4 分钟 → **15 秒量级**） | 低。需补格式化快照测试（货币/千分位/时区/毫秒） |
| **P0-2** | **按列预编译 formatter**：`convertRowToCsv` 里对 `sortedFieldIds` 预生成 `fn(value)`，行内只做 `fn(row[id])`，不再每格做类型判断与 `formatItemValue` 分发 | `CsvService.ts:279-330`、`ExcelService.ts:214-320`、`common/src/index.ts:1636-1666` | 叠加 P0-1 后把常数再压一次（实测合成 420 µs/行 → 18 µs/行） | 中。保留 `formatItemValue` 作兜底，做新旧逐格 diff 回归 |
| **P0-3** | **前端轮询加超时 + 阶段提示 + 失败可见**：两处轮询加 deadline（如 15 min）与最大次数；toast 分「查询中 / 生成文件中 / 下载中」；`fileUrl` 为空时明确报错 | `features/queryRunner/executeQuery.ts:15-40`、`features/scheduler/hooks/useScheduler.ts:263-294`、`components/ExportResults/index.tsx:160-209` | 消灭"永远转圈"，且让卡点自曝 | 低（纯前端） |

### P1 —— 透视导出与大文件（1–2 周）

| # | 改动 | 落点 | 预期收益 |
|---|---|---|---|
| **P1-1** | **透视导出流式化**：不要"全量数组 → 3 份矩阵 → 整串 → Buffer"。两遍法：第一遍只扫列集合/表头；第二遍逐行 pivot 并 `stringifier.write` 进 `pipeline` 直接写上传流；BOM 用 `writeStream.write` 而不是 `Buffer.concat` | `PivotTableService.ts:177-266` | 峰值内存 -50%~-70%，去掉 0.5–3 s 同步整串序列化 |
| **P1-2** | **`formatRows` 只算需要的字段**（`raw` / `formatted` 二选一，pivot 只用一种） | `common/src/index.ts:1636-1666`、`PivotTableService.ts:205`、`ExcelService.ts:354` | 透视路径再 -45%~-50%（`formatRows` 占 70–87%） |
| **P1-3** | **导出任务与 API 进程隔离**：导出任务单独队列/独立 worker，并发上限 1–2；把透视生成放进 `worker_thread`（沿用 `ProjectService` 里 `runWorkerThread` 的模式） | `SchedulerWorker.ts:376-410`、`App.ts:1060-1072`、`PivotTableService.ts` | 导出再慢也不堵 API；消除"一个人导出、全站卡死" |
| **P1-4** | **job 终态兜底**：`job:failed` 监听器补写 `scheduler_log` ERROR；`maxAttempts` 1→2；超时后真正取消底层流（`AbortController`） | `scheduler/SchedulerWorkerEventEmitter.ts:113-116`、`SchedulerClient.ts:55`、`SchedulerJobTimeout.ts:22-53` | 崩溃不再产生永久 `started` |
| **P1-5** | **背压修复**：`CsvService.streamJsonlRowsToFile` 改 `pipeline`；`S3ResultsFileStorageClient.write` 支持等 `drain` | `CsvService.ts:412-490`、`S3ResultsFileStorageClient.ts:102-112` | 内存有界，顺带修掉潜在丢行 |
| **P1-6** | **导出不再重跑查询**：`Limit.TABLE` 作为默认（受限角色也复用首屏 queryUuid）；确实要"全部"时在 UI 明示"将重新执行查询" | `ExportResults/index.tsx:104-113`、`useDashboardChartDownload.ts:70-110` | 省掉一次全表扫描 + 一次 JSONL 落盘 |
| **P1-7** | **XLSX 透视改流式**：`Excel.stream.xlsx.WorkbookWriter` + 去掉 O(行×列) 的自动列宽扫描（可用固定宽度）+ 直接流式上传 | `ExcelService.ts:332-411` | 内存从"整本 workbook + buffer"降到常数级 |

### P2 —— 结构性改善（按需排期）

| # | 改动 | 预期收益 |
|---|---|---|
| P2-1 | **一次流到底**：CSV 导出直接 `warehouse stream → format → CSV → 上传/下发`，JSONL 只作为缓存旁路（tee），去掉"落 S3 → 回读 → 再落 S3" | 省一次写 + 一次读，70 万行约数十–数百 MB 往返 |
| P2-2 | **分页索引**：落盘时写 sidecar（每 N 行记 byte offset），翻页用 S3 Range 定位 | 翻页从 O(n²) 降到 O(页) |
| P2-3 | **gzip**：JSONL/CSV 落 S3 加 `ContentEncoding: gzip`，读侧兼容旧明文 | 存储/传输字节 -70%~-85%（跨区/OSS 收益更明显） |
| P2-4 | **去掉 `/tmp` 中转**（v1 路径）：`writeRowsToFile` 直接 `uploadCsv(createReadStream)` 或统一走 `transformResultsIntoNewFile` | 峰值内存 -3× 文件大小 |
| P2-5 | **warehouse 原生卸载导出**：BigQuery `EXPORT DATA` / Snowflake `COPY INTO @stage` | 服务端 CPU 近 0，但格式化/标签一致性需另行解决 |
| P2-6 | **UI 文案纠正**：CSV 与 XLSX 的限制口径分开写；把"最多导出 1,000,000 行"限定为 XLSX | 减少误判 |

**不建议**的方向：
- 只调大 `SCHEDULER_JOB_TIMEOUT` / 并发 —— 不解决根因，只会让更多大任务同时压垮进程；
- 单纯加机器核数 —— CPU 是单线程同步段，加核无效（除非同时做 P1-3 隔离 + worker 化）。

---

## 4. 落地批次建议

| 批次 | 内容 | 交付物 | 预估 |
|---|---|---|---|
| 批次 1 | P0-1、P0-2、P0-3 | 格式化微基准 + 同数据集导出前后对比（耗时/峰值 RSS） | 3–5 人日 |
| 批次 2 | P1-1、P1-2、P1-5 | 透视导出流式化 + 背压修复 | 1 周 |
| 批次 3 | P1-3、P1-4、P1-6 | 进程隔离/worker + job 兜底 + 默认复用查询 | 1 周 |
| 批次 4 | P2-* | 按客户反馈再排 | — |

---

## 5. 配置层面的止血项（不改代码就能做）

| 项 | 现状默认 | 建议 | 说明 |
|---|---|---|---|
| `SCHEDULER_JOB_TIMEOUT` | 10 min | 保持或 15 min，但**必须同时做 P1-4**（否则超时后底层仍在跑） | 超时只保护 UI，不省 CPU |
| `SCHEDULER_CONCURRENCY` | 3 | 大导出高峰期可临时降到 1–2 | 减少内存峰值叠加 |
| `LIGHTDASH_CSV_CELLS_LIMIT` | 100000 | 明确其对**透视**才生效；非透视 CSV 目前无兜底 | 别指望它限制非透视 CSV |
| `RESULTS_CACHE_ENABLED` / 项目级 cache TTL | false | 打开可让"重复导出"零查询 | 依赖同 SQL，`Limit.ALL` 换 limit 会 miss |
| `USE_SQL_PIVOT_RESULTS` | false | 可评估开启（SQL 侧展开 vs JS pivot） | 透视路径差异较大，需要单独压测 |
| `S3_REQUEST_TIMEOUT` | 30 min（本 fork 已调） | 保持 | 已为"大文件下载超时"调过 |

---

## 6. 怎么确认主因（成本从低到高）

1. **零代码 A/B**：同一个图表，导出时把「值」从 `格式化` 切成 `原始值`（`onlyRaw`）。若秒级完成 → **R1 确认**，按 P0 批次走。
2. **看 job 耗时 vs 查询耗时**：
   ```sql
   -- 查询阶段耗时（毫秒）
   SELECT query_uuid, context, total_row_count, warehouse_execution_time_ms,
          results_created_at, results_updated_at
   FROM query_history
   WHERE chart_uuid = '<chart-uuid>'
   ORDER BY created_at DESC LIMIT 20;
   ```
   ```sql
   -- 导出 job 阶段（scheduled → started → completed 的时间差）
   SELECT job_id, task, status, created_at
   FROM scheduler_log WHERE job_id = '<job-id>' ORDER BY created_at;
   ```
   `completed - started` 远大于 `warehouse_execution_time_ms` → 时间花在**转换**（R1/R2），否则在数仓。
3. **孤儿 job**：跑第 2 节 R5 的 SQL，确认是否已出现永久 `started`。
4. **事件循环**：导出期间在容器内观察 API 是否整体无响应（`curl` 健康检查超时）→ R4 确认。
5. **度量埋点**（改造前后对比用）：给 `csvGenerationMs` / `pivotTransformMs` / `s3WriteMs` 加 span；job 内每 5 s 采样 `process.memoryUsage().heapUsed/rss` 与 `perf_hooks.monitorEventLoopDelay`。

---

## 7. 需要补齐的部署事实

| # | 事实 | 为什么重要 |
|---|---|---|
| U1 | 客户指的是 XLSX 还是 CSV 的「100 万」提示 | 决定优化对象（XLSX 有硬上限 100 万行；CSV 无上限） |
| U2 | 生产 `LIGHTDASH_CSV_CELLS_LIMIT` / `SCHEDULER_CONCURRENCY` / `SCHEDULER_JOB_TIMEOUT` | 决定透视是否在 `csvCellsLimit/列数` 行就被截断、是否撞 10 min 超时 |
| U3 | 生产是否启用 S3/OSS（`RESULTS_S3_*` / `S3_PUBLIC_ENDPOINT`） | 未启用 S3 时异步结果文件不落盘，导出会直接报错；启用时下载不占后端带宽 |
| U4 | 反代（nginx/ingress）`proxy_read_timeout` | 仓库内无反代配置，无法验证；1–2 分钟的轮询响应可能被 60s 超时掐断 |
| U5 | 客户命中 v2（当前前端）还是 v1（脚本/旧前端） | v1 走全量内存 + 整份 `readFile`，比 v2 更慢 |
| U6 | "SPU 市占表卡死"是**打开/滚动就卡**还是**点导出才卡** | 前者是前端 VTable 渲染（见 `./visualization/table-scroll-performance.md`），后者才是本文的导出链路 |

---

## 8. 风险与验收门槛（做之前先看）

风险按**严重度**排：致命 = 客户数据静默变错；高 = 客户可见行为变化或新的运维事故面；中 = 需要额外成本/回归。

### 8.1 逐项风险

| 项 | 严重度 | 具体风险 | 缓解 / 验收门槛 |
|---|---|---|---|
| **P0-1 / P0-2 格式化改动** | **致命（静默数据变更）** | ① 导出值与现状不再逐字节一致（客户脚本解析 CSV，金额/千分位/时间戳差一个字符就算事故）；② `formatting.ts` 是**前后端共用**文件，改动同时影响前端表格显示、复制值、tooltip；③ `toLocaleString(undefined, opts)` 走"服务器默认 locale"，缓存键漏 locale 会串味；④ `new Intl.NumberFormat` 对非法 currency 抛 `RangeError`，缓存实现必须保留"抛错"语义；⑤ `hourCycle`：`hour12:false` 在部分 ICU 版本下午夜输出 `24:00` 而非 `00:00` | 必须做**旧/新逐格 byte-diff**：固定语料（null/undefined/NaN/±0/`<2^53` 与 bigint/午夜/DST 边界/各 symbol 货币/`useGrouping:false`/自定义 format expression）+ 真实 2–3 张图表全量导出 `diff`。显式加 `hourCycle:'h23'`。缓存**有界**（LRU ~500）且键含 `locale` + `separator`。挂开关灰度一个版本。本地已验证 `format()` 与 `formatToParts()` 在 sv-SE 午夜、NY DST 边界输出一致（仍需 CI 固定） |
| **P1-1 透视流式化** | **致命** | 两遍读之间结果对象可能已过期（`results_expires_at` TTL）→ 第二遍 404；表头 colSpan / `rowTotals` / `columnTotals` / `undefinedCharacter` 语义稍有偏差 → **整列错位**（比慢严重得多） | 同批透视图表"旧/新实现"**整文件 diff**；两遍读期间固定结果对象生命周期；`truncated` 改为按预先算好的行数判定 |
| **P1-2 `formatRows` 只算一种值** | **高** | **不能一刀切**：`pivotQueryResults` 的分组/表头键用的是 `value.raw`（`pivotQueryResults.ts:609-625`），指标列用的是 `formatted`。砍掉 raw 会导致行折叠/表头错 | 按字段角色拆分：索引/表头维度保 `raw`，指标只保 `formatted`；用透视快照回归 |
| **P1-6 默认改 `Limit.TABLE`** | **高（静默截断）** | 受限角色现在默认 `ALL`（13.5 万行），改 TABLE 后导出只有首屏 limit 行数，用户以为导了全部 → 轻则投诉，重则决策用错数据。反过来"把首屏查询 limit 拉到导出上限"也不行：浏览成本前移，高频看板每次都跑全量 | 不靠改默认值优化。保留 ALL 但显式标注"将重新执行查询（预计 N 分钟）"，并显示**预计行数**；只在**同一 SQL 缓存命中**时复用 |
| **P0-3 前端超时** | **高（副作用放大）** | 只在客户端超时会留下**仍在跑的服务端任务**：用户重试 → 两个重任务并行 → 更慢更易 OOM；透视还会互相抢内存 | 超时必须是"提示 + 引导重试 + 可取消"，**与 P1-4（服务端真取消 + 终态兜底）同批上线**；重试前先查是否已有同图在跑的 job |
| **P1-3 进程隔离 / worker 化** | **中–高（运维面）** | ① 单容器部署（`docker-compose.yml` 只有一个服务）要额外进程/队列配置；② 每个 worker 独立堆 → **RSS 翻倍**，机器内存要重算；③ 用 `workerData` 结构化克隆大数组（可能 1 GB）成本可能超过收益 | worker 内**直接读 JSONL**，不要 clone 大数组；先只隔离导出队列（并发 1–2），再考虑拆进程；上线前压测宿主机 RSS |
| **P1-4 `maxAttempts` 1→2** | **中–高** | 重试会重放**非幂等副作用**：发邮件、写 Google Sheet、上传附件 → 客户收到两封/两版文件 | 只对下载类任务提 `maxAttempts`；邮件/gsheet 保持 1 或重试前查"已发送"标记。`job:failed` 补写 ERROR 是纯收益，可先单独上 |
| **P1-5 背压改 `pipeline`** | **中** | 现在靠 `'finish'` 收尾并在回调回传 `truncated`，改 `pipeline` 要保留 `truncated` 语义与 BOM 写入顺序；`streamJsonlData` 的 `results` 累计数组被 Excel 路径使用（`maxLines`），不能顺手删 | 两种 sink 形状都要测：本地文件 + `PassThrough→lib-storage Upload`；对比输出字节数与行数 |
| **P2-3 gzip** | **中** | 存量明文对象与新 gzip 对象混存 → 读侧必须按 `ContentEncoding` 分支；gsheet / 邮件附件 / zip 打包会拿到压缩流；OSS/CDN 可能二次压缩 | 缓存键带格式版本；先只压 JSONL（内部读写），CSV 最后压；逐消费方验证 |
| **P2-1 去掉 JSONL 中转** | **中（架构契约）** | JSONL 同时是**结果缓存**与**分页数据源**（`getResultsPageFromS3`），直接流到 CSV 会丢掉这两项 | 用 tee（同 chunk 写缓存 + 写目标），不做"二选一" |
| **P2-2 sidecar 行索引** | **中** | 存量文件没有索引（需 fallback）；job 中途崩溃会留下**索引与数据不一致**的文件 | 索引带 magic/行数校验，校验失败回退全量扫；写入端与 sidecar 同收尾 |
| **P2-5 warehouse 原生导出** | **中** | 产物是"原始文件"，与客户预期的**格式化值 / 中文表头 / 时区**不一致；每个适配器要单独配权限（Snowflake stage、BigQuery 目标桶） | 定位为"明细导出/性能通道"，格式化导出仍走 Lightdash；先单适配器试点 |
| **跨项：上游同步冲突** | **中（长期成本）** | 本仓与上游同步，`formatting.ts` / `CsvService` / `ExcelService` 都是上游高频改动文件，大改会**每次 sync 都冲突** | 尽量"新增模块 + 薄调用点"，不重排原文件；改动登记 `docs/v2/CHANGELOG`；给上游行为加测试锁 |
| **跨项：可观测性缺口** | **中** | 现在没有导出阶段的耗时/内存指标，改完说不清快了多少，也判断不出下一个瓶颈 | 先加 `csvGenerationMs` / `pivotTransformMs` / `s3WriteMs` 与峰值 RSS，再改代码（否则无法验收） |

> 补充实测（反驳一个常见担心）：**朴素 memo（每格 `JSON.stringify(options)` 拼 key）也够用**——本机 0.55 µs/格 vs 现状 17.25 µs/格；按列预编译 0.29 µs/格。所以 P0-1 不必等 P0-2 做完才有效，但两者叠加更省。

### 8.2 验收门槛（硬性）

1. **数据一致性**：同一批图表（至少 1 张透视、1 张含时间戳、1 张含货币）改动前后导出文件**逐字节一致**（除刻意修正项）。不通过不上线。
2. **性能**：同一数据集导出耗时 + 峰值 RSS 的前后对比表（量化到阶段）。目标：70 万行 / 20 列 ≤ 30 s。
3. **不回归**：`pnpm -F common test`、`pnpm -F backend test:dev:nowatch`、`pnpm -F common lint`、`pnpm -F backend lint` 全绿。
4. **灰度**：新实现挂在 env / feature flag 后，跑满一个发版周期再删旧路径。

### 8.3 方向判断

- **正确方向**：把导出从"同步、全量、与 API 同进程"改成"**分阶段、流式、可观测、可取消**"。这是唯一能同时改善"8 分钟"和"卡死"的路线，也与上游 v2 异步查询的方向一致。
- **不划算的方向**：只调 `SCHEDULER_JOB_TIMEOUT` / 并发、加 CPU 核数、把限制调小 —— 都不改根因，只是把问题往后拖。
- **要警惕的方向**：为了"快"牺牲**导出口径一致性**（默认截断、跳过格式化、透视走未验证的近似实现）。数据产品里，**慢可以解释，错不能**。

---

## 9. 相关文档


- [表格滚动卡顿排查](../visualization/table-scroll-performance.md)（透视表 v2 / VTable 渲染侧）
- [CDN + OSS 改造方案](./cdn-oss-integration-plan.md)（预签名直传、`S3_REQUEST_TIMEOUT`）
- [看板筛选 / 首屏性能排查](../dashboard/dashboard-filter-performance-investigation.md)（区分数仓往返与前端渲染的方法论）
