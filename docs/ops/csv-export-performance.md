# 大数据量导出（CSV / XLSX）优化

## 1. 为什么处理

客户反馈三条：只选一个月导出 13.5 万行（8 MB）等了 8 分钟没下来、界面一直转圈；70 万行要 1–2 分钟；「SPU市占表」点导出直接卡死。该表是平表不是透视表，17 列里大约 10 个数值指标，时间列是 `20260901` 这种数字，不是带时区的日期。

一次导出实际是串行的三段，任何一段慢都表现为"转圈"：

1. 前端取 queryUuid。选「表格结果」复用页面已经查过的 query，不重查；选「所有结果」会用 `LIMIT 2147483647` 重新执行一次查询，SQL 变了，缓存必然不命中。
2. 后台任务把结果转成 CSV/XLSX 再上传 OSS。这段代码跑在 scheduler worker 里，而 worker 和 API 在同一个进程。
3. 浏览器下载生成好的文件。

排查下来有四个原因：

**每格新建一个格式化器。** 数值格走 `value.toLocaleString(locale, options)`，每次调用都重建 ICU formatter，实测 18–33 µs；日期和时间戳格走 `new Intl.DateTimeFormat(...)` + `formatToParts()`，52–58 µs。70 万行、17 列，其中 10 列数值，光格式化就要三分钟以上。而「SPU市占表」正是这种以数值列为主的宽表。

**透视导出把结果全量物化了。** 先把整个 JSONL 读成数组，再对全部字段格式化一遍（每格同时算 raw 和 formatted，实际只用一份），然后建三份「行 × 列」矩阵，拼成一个完整字符串，再复制成 Buffer 上传。峰值内存是数据量的 5–6 倍，而且这段全是同步代码，没有 await，也没有 worker。

**导出任务和 API 同进程。** `SCHEDULER_ENABLED=true` 让 API 进程内也跑 worker（单副本）。上面那段同步 CPU 一跑，这台 pod 的 HTTP 请求全部排队，连轮询任务状态的接口都答不上，用户看到的就是卡死。同时 `tryJobOrTimeout` 的 10 分钟兜底也因为事件循环被堵而无法准时触发。

**前端轮询没有超时。** 查询和任务两处轮询都是无限重试。任务如果因为进程被杀停在 `started`（`maxAttempts=1`，`job:failed` 只打日志不写库），界面会一直转圈到用户刷新页面。

顺带发现三个小问题：结果 JSONL 落 OSS 不压缩；非透视 CSV 完全没有行数上限（XLSX 有 100 万行限制，CSV 没有）；`query_history` 存了 `compiled_sql`、`metric_query`、`fields`，每行约 10 KB，23.5 万行占 2.4 GB。

## 2. 效果

单格实测（本机，`BENCH=1` 可复现）：

| 类型 | 改前 | 改后 |
|---|---|---|
| 数值格（默认格式） | 33.5 µs | 0.9 µs |
| 数值格（货币，legacy format） | 25.2 µs | 1.7 µs |
| 数值格（百分比） | 22.7 µs | 1.8 µs |
| 日期/时间戳格（带时区） | 58 µs | 2.5 µs |
| XLSX 货币格（每格两次 Intl） | ~70 µs | ~2 µs |

整行（20 列：12 字符串 + 2 时间戳 + 1 日期 + 5 数值指标）288.4 µs → 21.9 µs，13.2 倍。按此推算纯格式化部分：

| 行数 | 改前 | 改后 |
|---|---|---|
| 13.5 万 | 39 s | 3 s |
| 70 万 | 202 s | 15 s |

XLSX 另有 exceljs 本身的成本：17 列实测 33.5 µs/行（约 3 万行/秒），70 万行光写文件就要 23 s。关掉 shared strings 后整条 XLSX 链路 59.3 → 37.8 µs/行，70 万行 41 s → 26 s。

JSONL 压缩：17 列 10 万行 34.2 MB → 4 MB（12%），gzip 69 ms、gunzip 60 ms（level 3，70 万行约 0.9 s / 0.4 s）。

以上都只影响"查询拿到结果之后"这一段，数仓查询时间没有变化。如果客户的 8 分钟里数仓占了大头，这些改动只能缩短剩下那部分。

## 3. 功能实现

代码（`feat/export-perf`，已合入 dev）：

- [x] 数值格式化复用 `Intl.NumberFormat` 实例（按 locale + options 缓存，上限 512）；非数值保留 `toLocaleString` 原语义
- [x] 时区日期格式化合并成一份实现，复用 `Intl.DateTimeFormat`，`format()` 替代 `formatToParts()`，带一次性 ICU 自检回退
- [x] `formatItemValue` 里 `getCustomFormat` 改惰性求值，字符串/布尔/日期列不再白建对象
- [x] 格式表达式按内容缓存（XLSX 每格都会调用 `convertCustomFormatToFormatExpression`）
- [x] 透视 CSV 改流式写盘 + 文件流上传，去掉整串字符串和两次 Buffer 拷贝（峰值内存降 50–70%）
- [x] 透视 XLSX 改 `WorkbookWriter` 落盘，列宽由扫全表改为采样 200 行
- [x] 非透视 XLSX 关 `useSharedStrings`、行用数组写入（值与 `numFmt` 不变）
- [x] 结果 JSONL 支持 gzip（`RESULTS_JSONL_GZIP`），读侧按 `ContentEncoding` 自动解压，存量明文直读
- [x] 非透视 CSV 加行数上限（`EXPORT_MAX_ROWS`，默认 100 万），命中置 `truncated`
- [x] 前端导出：轮询加 20 分钟截止、提示显示已处理秒数、拿不到文件地址时报错
- [x] 回测用例（见第 5 节）

配置（`k8s-config`）：

- [x] pre：`resources` 500m/2Gi、2 CPU/8Gi；`NODE_OPTIONS=--max-old-space-size=6144`；`SCHEDULER_JOB_TIMEOUT=1200000`；日志 `info`；`S3_ENDPOINT` 内网；`RESULTS_JSONL_GZIP=true`；image `2.5.6`
- [x] master：`resources` 500m/2Gi、4 CPU/8Gi；`NODE_OPTIONS` 同上；`SCHEDULER_JOB_TIMEOUT` 同上；日志 `info`；`S3_ENDPOINT` 内网（`lightdash` 与 `lightdash-internal`）；`RESULTS_JSONL_GZIP=false`
- [ ] master：image 仍是 `0.2091.11`，发版时改为含上述代码改动的版本，并决定是否把 `RESULTS_JSONL_GZIP` 置 `true`

## 4. 待做：需要运维或数据团队配合

- [ ] **scheduler 从 API 进程拆出去**
  新增 Deployment 跑 `node dist/scheduler.js`，主 pod `SCHEDULER_ENABLED=false`。解决导出期间 API 同进程被 CPU 占满的问题。
  运维：新增 Deployment、独立资源配额；按任务类型决定是否拆两个 scheduler 节点（`SCHEDULER_INCLUDE_TASKS`）。邮件/订阅任务要留在会消费它们的节点，`generateDailyJobs`、`cleanQueryHistory` 是 cron 任务，至少一个节点要 include，否则 `query_history` 没人清理。
  前置：无。预估 1 人日 + 半天验证。这是剩余项里最值得先做的，它同时解决"导出拖慢全站"和"一台机器被大任务占满"。

- [ ] **结果文件与业务资源分开存放**
  现在结果 JSONL 落在业务桶 `qmgy-report` 根目录，而该桶挂着公共读域名 `report-assets.brandct.com`；`cleanQueryHistory` 只删数据库行，不删 OSS 对象，存储会一直涨。
  运维：单独桶或 `S3_PATH_PREFIX`、桶生命周期规则、确认公共读域名只覆盖业务资源前缀。注意前缀对所有 S3 写入都生效（截图、导出文件也会进新路径），存量对象位置不变。
  前置：无。预估半天。

- [ ] **导出任务单独限流**
  导出与订阅、校验、SQL Runner 共用一个并发池（`SCHEDULER_CONCURRENCY`，默认 3），一个大导出会堵住后面的任务。
  代码：新增导出类任务的并发配置项；运维：确认每并发对应的内存配额、加队列长度告警。
  前置：在 scheduler 拆进程之后做更有效。预估 1 人日。

- [ ] **导出阶段监控指标**
  现在没有分阶段耗时，改完说不清快了多少，也判断不出下一个瓶颈。
  代码：任务总时长、各阶段耗时（读 JSONL / 格式化 / 上传）、峰值 RSS；运维：抓取、看板、告警阈值（如 RSS 超过 limit 的 80%），顺带按实际峰值重算单 pod 的内存上限和节点容量。
  前置：无。预估 1 人日。

- [ ] **数仓侧预聚合或分区裁剪**
  `SPU市占-全量模型` 这类月粒度分析表适合做物化或预聚合；先用 `query_history.compiled_sql` 跑 `EXPLAIN ANALYZE`，确认是扫描量大还是 join 策略问题。
  数据团队：dbt 侧改动。应用层改不了这块，但它决定客户体感的上限。
  前置：先按第 6 节的方法测出数仓耗时的占比。

- [ ] **透视表「所有结果」按导出口径限制查询行数**
  现在是拉回全表再截断，被截掉的部分白查白写。
  产品：确认口径（边界差一行就会少数据）。代码：前后端共用一个上限函数并加行数断言。
  前置：口径确认。预估 1 人日。

- [ ] **导出链路跳过 JSONL 往返**
  查询时同时写 JSONL 和 CSV，导出任务只返回 URL；或者前端不预跑查询，导出任务自己编译 SQL 出文件（后者要复刻权限、用户属性、dashboard 上下文、参数字段映射）。
  代码 3–5 人日，风险最高。
  前置：gzip 之后中间文件只剩二十几 MB，省下的读时间约 1–5 秒，建议在 scheduler 拆进程、结果文件独立桶做完、数据量再上一个台阶后再评估。

- [ ] **大数据量时提示改用 CSV**
  同数据量下 CSV 比 XLSX 快一倍以上（省掉 exceljs 约 23 秒/70 万行）。
  产品：文案。零代码风险。预估 0.5 人日。

## 5. 导出产物有没有变

没有，三点可以确认：

- 客户拿到的仍是明文 CSV / XLSX。gzip 只作用在 OSS 上的中间 JSONL，读的时候在 `getDowloadStream` 一处自动解压，导出产物不压缩。
- 数值、百分比、货币、日期时区的格式化逻辑没改，只是不再每次新建格式化器。
- `EXPORT_MAX_ROWS` 默认 100 万，与现网 `LIGHTDASH_QUERY_MAX_LIMIT=1000000` 一致，正常导出不会触发截断；真触发时会置 `truncated`、前端提示、文件名带 `incomplete_results-`。

回测用例都在仓库里，`BENCH=1` 可跑基准：

| 测试 | 断言 |
|---|---|
| `packages/common/src/utils/formatting.bytecompat.test.ts` | 124 种格式 × 23 种值 = 2852 组，新旧实现逐字节一致（含 NaN、Infinity、±0、2^53、空串、各币种、各分隔符） |
| `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.test.ts` | 7 时区 × 21 时间点 × 2 模式，含午夜、夏令时前后、闰日、毫秒补零、非法值 |
| `packages/backend/src/services/CsvService/CsvService.stream.test.ts` | gzip 源与明文源导出 CSV 逐字节相等；截断产物是完整导出的逐字节前缀；未超限不标记 |
| `packages/backend/src/services/ExcelService/ExcelService.stream.test.ts` | exceljs 读回产物，单元格值与 `numFmt` 不变 |
| `packages/backend/src/clients/ResultsFileStorageClients/S3ResultsFileStorageClient.test.ts` | gzip 对象自动解压，存量明文对象照常读 |
| `packages/backend/src/services/PivotTableService/PivotTableService.csv.test.ts` | 透视 CSV 与一次性 stringify 逐字节一致（含逗号、引号、换行、emoji、两万行） |

## 6. 怎么确认线上有没有效果

导出时看两个数：

1. 浏览器开发者工具里 `GET /api/v2/projects/<p>/query/<uuid>` 的响应中有 `initialQueryExecutionMs`，这是数仓耗时。
2. 从 `POST .../schedule-download` 到任务状态变 `COMPLETED` 的间隔，是导出总时长。

两者相减就是格式化与写文件的时间，也就是这次改动的部分。如果数仓耗时占了大头，说明慢在仓库查询，拿 `compiled_sql` 去 Hologres 跑 `EXPLAIN ANALYZE`，靠 dbt 或分区解决。

## 7. 注意

- `RESULTS_JSONL_GZIP` 开启后，回滚到不支持 gzip 的老镜像会读不了那段时间写入的对象（压缩字节被当文本解析，逐行报错跳过，导出只剩表头）。默认 TTL 一天，等对象过期再回滚。
- `SCHEDULER_JOB_TIMEOUT` 和前端 20 分钟截止都只改状态，超时后底层任务仍在跑，不释放 CPU 与内存。
- `query_history` 每行约 10 KB，排查时不要对大文本列用 `LIKE`，按 `created_at` 缩窗口再过滤。
- 非透视 CSV 以前没有行数上限，现在默认 100 万；需要更多调 `EXPORT_MAX_ROWS`，不要去掉限制。
