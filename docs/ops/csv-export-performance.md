# 大数据量导出（CSV / XLSX）优化

状态：本期改动已合入 dev（镜像 2.5.6）；后续事项待评估。

## 一、反馈原文

以下三条来自使用方反馈，未做加工：

> 当前只选择一个月份，结果 135,725 条，限制显示可以下载 100 万条，但是导出结果一直不动，转圈，下载不下来数据，需优化下载。

> 目前下载仅一个月的数据，8 MB 需要 8 分钟左右，700k 也需要 1–2 分钟，影响使用。

> 客户反馈最慢的是 SPU 市占表，直接卡死，数据量太大。

补充两条核查到的事实：

- SPU 市占表是平表，不是透视表。截图里可见 17 列：1 列"时间标签"（值为「月度」）、1 列"时间"（值为 `20260901`，数字或字符串，不是带时区的日期）、6 列文本维度、约 10 列数值指标（占比、金额、整数）。
- 该字段 `时间` 不走时区格式化逻辑，因此优化方向不在日期格式化上。

## 二、导出链路与耗时构成

一次导出是串行三段：

1. 前端取 queryUuid。选「表格结果」复用页面已查过的 query，不重查；选「所有结果」会用 `LIMIT 2147483647` 重新执行一次查询。
2. 后台任务把结果文件转成 CSV/XLSX 并上传对象存储。这段跑在 scheduler worker 里，而 worker 与 API 同进程。
3. 浏览器下载生成好的文件。

第 1 段的耗时取决于数仓，应用层无法优化。本次改动集中在第 2 段，第 3 段顺带做了内网 endpoint 与中间文件压缩。

## 三、定位到的原因

**逐单元格构造格式化器。** 数值格调用 `value.toLocaleString(locale, options)`，每次重建 ICU formatter，实测 18–33 µs；日期与时间戳格用 `new Intl.DateTimeFormat(...)` + `formatToParts()`，52–58 µs。70 万行、17 列（其中约 10 列数值）累计三分钟以上。SPU 市占表正是这种数值列为主的宽表。

**透视导出全量物化。** 先把整个结果文件读成数组，对全部字段格式化一遍（每格同时算 raw 和 formatted，实际只用一份），再构造三份「行 × 列」矩阵，拼成一个完整字符串，复制成 Buffer 后整块上传。峰值内存是数据量的 5–6 倍，且整段是同步代码，没有 await 也没有 worker。这条只影响透视表，客户反馈的 SPU 表不走这条路，但它是另一类报表卡死的原因。

**导出任务与 API 同进程。** `SCHEDULER_ENABLED=true` 让 API 进程内也跑 worker，部署是单副本。第 2 段的同步 CPU 一启动，这台 pod 的 HTTP 请求一起排队，包括轮询任务状态的接口。同时 `tryJobOrTimeout` 的 10 分钟兜底也因事件循环被占满而无法准时触发。

**前端轮询没有超时。** 查询和任务两处轮询都是无限重试。任务如果因进程被杀停在 `started`（`maxAttempts=1`，`job:failed` 只打日志不写库），界面会一直转圈直到用户刷新。

顺带核查到的三个问题：

- 结果 JSONL 落对象存储时未压缩。
- 非透视 CSV 没有任何行数上限（XLSX 有 100 万行限制）。
- `query_history` 每行约 10 KB（存了 `compiled_sql`、`metric_query`、`fields`），23.5 万行占 2.4 GB，按内容检索会拖慢数据库。

## 四、已实施的改动

| 改动 | 效果 | 位置 |
|---|---|---|
| 数值格式化复用 `Intl.NumberFormat`（按 locale + options 缓存，上限 512） | 18–33 µs → 0.7–1.7 µs | `packages/common/src/utils/formatting.ts` |
| 时区日期格式化合并为一份实现，复用 `Intl.DateTimeFormat`，`format()` 替代 `formatToParts()`，带一次性 ICU 自检回退 | 52–58 µs → 2.5 µs | `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.ts` |
| `formatItemValue` 中 `getCustomFormat` 改惰性求值 | 文本/布尔/日期列不再白建对象 | `formatting.ts` |
| 格式表达式按内容缓存（XLSX 每格都会调用） | 货币格 ~70 µs → ~2 µs | `formatting.ts` |
| 透视 CSV 改流式写盘 + 文件流上传，去掉整串字符串与两次 Buffer 拷贝 | 峰值内存降 50–70% | `PivotTableService.ts` |
| 透视 XLSX 改 `WorkbookWriter` 落盘，列宽由扫全表改为采样 200 行 | 内存从整本工作簿降到常数级 | `ExcelService.ts` |
| 非透视 XLSX 关 `useSharedStrings`、行用数组写入 | 17 列 59.3 → 37.8 µs/行 | `ExcelService.ts` |
| 结果 JSONL 支持 gzip（`RESULTS_JSONL_GZIP`），读侧按 `ContentEncoding` 自动解压，存量明文直读 | 10 万行 34 MB → 4 MB | `S3ResultsFileStorageClient.ts` |
| 非透视 CSV 加行数上限 `EXPORT_MAX_ROWS`（默认 100 万），命中置 `truncated` | 防单次导出打满 pod | `parseConfig.ts`、`CsvService.ts` |
| 前端轮询加 20 分钟截止、提示显示已处理秒数、拿不到文件地址时报错 | 不再无限转圈、不再静默失败 | `executeQuery.ts`、`useScheduler.ts`、`ExportResults/index.tsx` |

## 五、实测效果

单格（本机，`BENCH=1` 可复现）：

| 类型 | 改前 | 改后 |
|---|---|---|
| 数值（默认格式） | 33.5 µs | 0.9 µs |
| 数值（金额，legacy format） | 25.2 µs | 1.7 µs |
| 数值（百分比） | 22.7 µs | 1.8 µs |
| 日期 / 时间戳（含时区换算） | 58 µs | 2.5 µs |
| XLSX 货币格（每格两次 Intl） | ~70 µs | ~2 µs |

整行（20 列：12 文本 + 2 时间戳 + 1 日期 + 5 数值指标）：288.4 µs → 21.9 µs，13.2 倍。按此推算纯格式化部分：

| 行数 | 改前 | 改后 |
|---|---|---|
| 13.5 万 | 39 s | 3 s |
| 70 万 | 202 s | 15 s |

XLSX 另有格式本身的成本：17 列 10 万行基准 33.5 µs/行（约 3 万行/秒），70 万行单写文件约 23 s。关 shared strings 后整条链路 59.3 → 37.8 µs/行，70 万行 41 s → 26 s。

JSONL 压缩（17 列 10 万行）：34.2 MB → 4 MB，gzip 69 ms、gunzip 60 ms（level 3）。

以上只覆盖"查询拿到结果之后"这一段，数仓查询时间不变。用第 8 节的方法可以先量出数仓耗时占比。

## 六、导出产物的一致性

三点结论：

- 客户拿到的仍是明文 CSV / XLSX。压缩只作用于服务端中间 JSONL，读取时在 `getDowloadStream` 一处自动解压。
- 数值、百分比、金额、日期时区的显示规则未改动，只是不再每次重建格式化器。
- `EXPORT_MAX_ROWS` 默认 100 万，与现网 `LIGHTDASH_QUERY_MAX_LIMIT=1000000` 一致，正常导出不触发；触发时置 `truncated`、前端提示、文件名带 `incomplete_results-`。

回测用例：

| 用例 | 断言 |
|---|---|
| `packages/common/src/utils/formatting.bytecompat.test.ts` | 124 种格式 × 23 种值 = 2852 组，新旧实现逐字节一致（含 NaN、Infinity、±0、2^53、空串、各币种、各分隔符） |
| `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.test.ts` | 7 时区 × 21 时间点 × 2 模式，含午夜、夏令时前后、闰日、毫秒补零、非法值 |
| `packages/backend/src/services/CsvService/CsvService.stream.test.ts` | gzip 源与明文源导出 CSV 逐字节相等；截断产物是完整导出的逐字节前缀；未超限不标记 |
| `packages/backend/src/services/ExcelService/ExcelService.stream.test.ts` | exceljs 读回产物，单元格值与 `numFmt` 不变 |
| `packages/backend/src/clients/ResultsFileStorageClients/S3ResultsFileStorageClient.test.ts` | gzip 对象自动解压，存量明文对象照常读 |
| `packages/backend/src/services/PivotTableService/PivotTableService.csv.test.ts` | 透视 CSV 与一次性 stringify 逐字节一致（含逗号、引号、换行、emoji、两万行） |

## 七、后续可评估事项

不在本期范围内，列出以便评估。状态均为待评估或暂不考虑。

| 事项 | 解决什么 | 依赖方 | 预估投入 | 状态 |
|---|---|---|---|---|
| 导出任务与数据服务拆进程 | 导出期间同 pod 的 HTTP 请求排队 | 运维 | 1 人日 + 半天验证 | 待评估 |
| 结果文件独立存放 + 生命周期 | 结果文件与业务资源同桶，且只删数据库记录不删对象 | 运维 | 半天 | 待评估 |
| 导出任务单独限流 | 大导出会把订阅、校验、SQL 查询等任务堵在队列里 | 研发 + 运维 | 1 人日 | 待评估，依赖上一项 |
| 导出阶段监控 | 无分阶段耗时，无法量化收益，也判断不出下一个瓶颈 | 研发 + 运维 | 1 人日 | 待评估 |
| 数仓侧预聚合 / 分区裁剪 | 查询本身耗时，是端到端耗时的上限 | 数据团队 | 待评估 | 待评估，先测数仓耗时占比 |
| 透视表「所有结果」按导出上限查询 | 现在拉回全表再截断，被截掉的部分白查白写 | 产品 | 1 人日 | 待评估，需先定口径 |
| 大数据量提示改用 CSV | 同数据量下 CSV 比 XLSX 快一倍以上 | 产品 | 0.5 人日 | 待评估，属文案 |
| 导出链路跳过中间文件 | 再省一次全量读写 | 研发 | 3–5 人日 | 暂不考虑，压缩后只省 1–5 秒 |

## 八、如何验证线上效果

导出时看两个数：

1. 浏览器开发者工具中 `GET /api/v2/projects/<projectUuid>/query/<queryUuid>` 响应里的 `initialQueryExecutionMs`，这是数仓耗时。
2. 从 `POST .../schedule-download` 到任务状态变为 `COMPLETED` 的间隔，这是导出总时长。

两者相减即第 2 段的耗时。若数仓耗时占大头，用 `query_history.compiled_sql` 到 Hologres 跑 `EXPLAIN ANALYZE`，靠 dbt 预聚合或分区解决。

## 九、风险与约束

- `RESULTS_JSONL_GZIP` 默认关闭，各环境单独开启。开启后若回滚到不支持 gzip 的旧镜像，那段时间写入的中间文件旧版本读不了（压缩字节被当文本解析，逐行报错跳过，导出只剩表头）。默认 TTL 一天，等对象过期再回滚。
- `SCHEDULER_JOB_TIMEOUT` 与前端 20 分钟截止只改状态，超时后底层任务仍在跑，不释放 CPU 与内存。
- `query_history` 每行约 10 KB，排查时不要对大文本列用 `LIKE`，按 `created_at` 缩窗口再过滤。
- 非透视 CSV 以前没有行数上限，现在默认 100 万；需要更多调 `EXPORT_MAX_ROWS`，不要去掉限制。

## 附录：环境配置

预发（`lightdash-config`）：`resources` requests 500m/2Gi、limits 2 CPU/8Gi；`NODE_OPTIONS=--max-old-space-size=6144`；`SCHEDULER_JOB_TIMEOUT=1200000`；`LIGHTDASH_LOG_LEVEL=info`；`S3_ENDPOINT` 内网；`RESULTS_JSONL_GZIP=true`；image `2.5.6`。

生产（`lightdash-config`）：`resources` requests 500m/2Gi、limits 4 CPU/8Gi；其余同上；`RESULTS_JSONL_GZIP=false`（新镜像验证后再开）；image 仍为 `0.2091.11`，发版时更新。
