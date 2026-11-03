# 大数据量导出（CSV / XLSX）性能：已完成与后续方案

状态：第一批已上线（dev 分支，镜像 2.5.6）；配置已在 k8s-config 提交；后续架构优化未开始。

## 一、已经完成，可以直接用

### 代码改动

| 改动 | 效果 | 位置 |
|---|---|---|
| 复用 `Intl.NumberFormat`（按 locale + options 缓存） | 数值格 18–33 µs → 0.7–1.7 µs | `packages/common/src/utils/formatting.ts` |
| 时区日期格式化抽成一份并缓存 `Intl.DateTimeFormat`，用 `format()` 替代 `formatToParts()` | 52–58 µs → 2.5 µs | `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.ts` |
| `formatItemValue` 里 `getCustomFormat` 改惰性求值 | 字符串/布尔/日期列不再白建对象 | `formatting.ts` |
| 格式表达式（XLSX 每格都算）按内容缓存 | 货币格 ~70 µs → ~2 µs | `formatting.ts` |
| 透视 CSV 改流式写盘 + 文件流上传，去掉整串字符串和两次 Buffer 拷贝 | 峰值内存降 50–70% | `PivotTableService.ts` |
| 透视 XLSX 改 `WorkbookWriter` 落盘，列宽由扫全表改为采样 200 行 | 内存从"整本工作簿"降到常数级 | `ExcelService.ts` |
| 非透视 XLSX 关 `useSharedStrings`，行用数组写入 | 17 列 59.3 → 37.8 µs/行，70 万行 41 s → 26 s | `ExcelService.ts` |
| 结果 JSONL 可 gzip（`RESULTS_JSONL_GZIP`） | 10 万行 34 MB → 4 MB | `S3ResultsFileStorageClient.ts` |
| 非透视 CSV 加行数上限 `EXPORT_MAX_ROWS` | 命中置 `truncated`，前端提示、文件名带 `incomplete_results-` | `parseConfig.ts`、`CsvService.ts` |
| 前端轮询加 20 分钟截止、提示显示已处理秒数、拿不到文件地址时明确报错 | 不再无限转圈、不再静默失败 | `executeQuery.ts`、`useScheduler.ts`、`ExportResults/index.tsx` |

20 列（12 字符串 + 2 时间戳 + 1 日期 + 5 指标）整行耗时 288.4 µs → 21.9 µs。按此推算纯格式化部分：13.5 万行 39 s → 3 s，70 万行 202 s → 15 s。数仓查询时间不变。

### 配置（已在 k8s-config 完成）

pre（`lightdash-config`）：

| 配置 | 值 | 作用 |
|---|---|---|
| `resources` | requests 500m/2Gi，limits 2 CPU/8Gi | 导出峰值内存有上限 |
| `NODE_OPTIONS` | `--max-old-space-size=6144` | 与 8Gi limit 匹配 |
| `SCHEDULER_JOB_TIMEOUT` | `1200000` | 大批量导出不再撞默认 10 分钟线 |
| `LIGHTDASH_LOG_LEVEL` | `info` | 不再打每条 SQL |
| `S3_ENDPOINT` | `https://oss-cn-hangzhou-internal.aliyuncs.com` | 后端读写走内网 |
| `RESULTS_JSONL_GZIP` | `true` | 中间结果压缩 |
| image | `2.5.6` | 含上述代码改动 |

master（`lightdash-config`）：`resources` requests 500m/2Gi、limits 4 CPU/8Gi；`NODE_OPTIONS` 同上；`SCHEDULER_JOB_TIMEOUT` 同上；日志级别 `info`；S3 内网 endpoint（`lightdash` 与 `lightdash-internal` 都改）；`RESULTS_JSONL_GZIP` 显式 `false`，等新镜像验证后再开。image 仍是 0.2091.11，发版时才改。

### 对导出产物的影响

没有影响，有三点可以直接确认：

- 客户拿到的仍是明文 CSV / XLSX。gzip 只作用在 OSS 上的中间 JSONL，读的时候在 `getDowloadStream` 一处自动解压，导出产物不压缩。
- 数值、百分比、货币、日期时区的格式化逻辑没改，只是不再每次新建格式化器。
- `EXPORT_MAX_ROWS` 默认 100 万，与现网 `LIGHTDASH_QUERY_MAX_LIMIT=1000000` 一致，正常导出不会触发截断。

回测都在仓库里，`BENCH=1` 可跑基准：

| 测试 | 断言 |
|---|---|
| `packages/common/src/utils/formatting.bytecompat.test.ts` | 124 种格式 × 23 种值 = 2852 组，新旧实现逐字节一致 |
| `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.test.ts` | 7 时区 × 21 时间点 × 2 模式，含午夜、夏令时前后、闰日、毫秒补零 |
| `packages/backend/src/services/CsvService/CsvService.stream.test.ts` | gzip 源与明文源导出 CSV 逐字节相等；截断产物是完整导出的逐字节前缀 |
| `packages/backend/src/services/ExcelService/ExcelService.stream.test.ts` | exceljs 读回产物，单元格值与 `numFmt` 不变 |
| `packages/backend/src/clients/ResultsFileStorageClients/S3ResultsFileStorageClient.test.ts` | gzip 对象自动解压，存量明文对象照常读 |
| `packages/backend/src/services/PivotTableService/PivotTableService.csv.test.ts` | 透视 CSV 与一次性 stringify 逐字节一致 |

## 二、后续方案：架构优化，需要运维或数据团队参与

按收益和前置条件排序。

### 1. 把 scheduler 从 API 进程拆出去

现状：`SCHEDULER_ENABLED=true` 让 API 进程内也跑 worker（单 pod），导出的同步 CPU 段会和 HTTP 抢同一台机器，导出期间整站变慢，连任务状态轮询都答不上。

方案：新增一个 Deployment 跑 `node dist/scheduler.js`，主 pod 设 `SCHEDULER_ENABLED=false`。

需要运维做：新增 Deployment 与镜像、给它单独的资源配额、按任务类型决定是否拆成两个 scheduler 节点（用 `SCHEDULER_INCLUDE_TASKS` 白名单）。注意邮件/订阅/gsheet 任务要留在会消费它们的节点上；`generateDailyJobs` 和 `cleanQueryHistory` 是 cron 任务，至少一个节点要 include，否则 `query_history` 没人清理。

预估 1 人日配置 + 半天验证。这是剩余优化里最值得先做的一项，因为它同时解决"导出拖慢全站"和"一台机器被大任务占满"。

### 2. 结果文件与业务资源分开存放

现状：结果 JSONL 落在业务桶 `qmgy-report` 根目录，而这个桶挂着公共读域名 `report-assets.brandct.com`；`cleanQueryHistory` 只删数据库行，不删 OSS 对象，存储会一直涨。

方案：给结果文件单独一个桶，或者至少加 `S3_PATH_PREFIX`；桶上配生命周期规则（比如 7 天自动删除）。

需要运维做：建桶/加前缀、配生命周期规则、确认公共读域名只覆盖业务资源前缀。改动前要注意：前缀对所有 S3 写入生效（截图、导出文件也会进新路径），存量对象位置不变、旧链接仍可用。

预估半天。属于存储治理加安全收口，和性能无关但迟早要做。

### 3. 导出任务单独限流

现状：导出与订阅、校验、SQL Runner 共用一个并发池（`SCHEDULER_CONCURRENCY`，默认 3），一个大导出会把后面的任务全堵住。

方案：给导出类任务单独的并发限制（需要新增配置项，属于代码改动），配合第 1 项拆进程。

需要运维做：确认资源配额与并发上限的对应关系（每并发大约需要多少内存），在监控里加队列长度告警。

预估代码 0.5 人日，运维 0.5 人日。

### 4. 监控埋点与容量规划

现状：导出阶段没有分阶段耗时指标，改完说不清快了多少，也判断不出下一个瓶颈在哪。

方案：加三个指标——导出任务总时长、各阶段耗时（读 JSONL / 格式化 / 上传）、峰值 RSS；Prometheus 已经在跑，队列长度指标是现成的。

需要运维做：确认指标抓取与看板、设告警阈值（比如峰值 RSS 超过 limit 的 80%）；同时给单 pod 的内存上限和节点容量做一次规划，现在单副本 + 8Gi limit 是拍出来的估值。

预估代码 0.5 人日，运维 0.5 人日。

### 5. 数仓侧优化（收益最大，但不属于应用层）

客户反馈的"8 分钟"要拆开看：如果数仓查询本身就占了几分钟，应用层再怎么优化也没用。目前的判断方法是导出时对比两个数——浏览器里 `GET /api/v2/projects/<p>/query/<uuid>` 响应中的 `initialQueryExecutionMs`（数仓耗时），以及从 `POST .../schedule-download` 到任务 `COMPLETED` 的间隔（导出总时长），两者相减是格式化与写文件的时间。

如果数仓占大头，需要数据团队配合：把常用的宽表做预聚合或物化（`SPU市占-全量模型` 这种月粒度分析表很适合），或者在 Hologres 侧确认分区裁剪生效（拿 `query_history.compiled_sql` 跑 `EXPLAIN ANALYZE` 看执行计划）。

这项工作不归应用层，但它决定客户体感的上限。

### 6. 导出链路改造：跳过 JSONL 往返

现状：查询时把结果写成 JSONL，导出任务再读回来转 CSV，多一次全量写和一次全量读。

方案有两种：查询时同时写 JSONL 和 CSV（tee），导出任务直接返回 CSV 的 URL；或者前端不再预跑查询，导出任务自己编译 SQL 直接出文件。后者要复刻权限、用户属性、dashboard 上下文、参数字段映射，风险最高。

为什么现在不做：gzip 上线后中间文件只剩二十几 MB，省下的读时间大概 1–5 秒，不值得为此改造链路。等第 1、2 项完成、客户数据量再上一个台阶之后再评估。

预估 3–5 人日。

### 7. 需要产品决策的两项

- 透视表选「所有结果」时，是否允许按导出口径限制查询行数（现在是拉回全表再截断，被截掉的部分白查白写）。边界差一行就会少数据，需要明确口径。
- 大数据量导出时是否提示用户改用 CSV（同数据量下 CSV 比 XLSX 快一倍以上，省掉 exceljs 那 23 秒/70 万行）。属于文案改动，零风险。

## 三、几个需要记住的约束

- `RESULTS_JSONL_GZIP` 默认关闭。开启后如果回滚到不支持 gzip 的老镜像，那段时间写入的对象老代码读不了（会把压缩字节当文本解析，逐行报错跳过，导出只剩表头）。默认 TTL 一天，等一天让对象过期再回滚，或者干脆不回滚。
- `SCHEDULER_JOB_TIMEOUT` 只影响任务状态，超时后底层 Promise 仍在跑，不会释放 CPU 和内存。前端 20 分钟截止也是同理，只解决界面转圈，不解决后端还在烧资源。
- `query_history` 实测 23.5 万行、2.4 GB（每行约 10 KB，存了 `compiled_sql`、`metric_query`、`fields`）。排查时不要对大文本列用 `LIKE`，会卡住，按 `created_at` 缩窗口再过滤。
- 非透视 CSV 以前完全没有行数上限，现在有 100 万兜底；如果客户确实需要更多，调 `EXPORT_MAX_ROWS` 而不是去掉限制。
