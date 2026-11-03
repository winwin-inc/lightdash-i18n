# 大数据量导出（CSV / XLSX）性能排查与优化

状态：已上线部分优化（dev / 2.5.6），另有若干项需要运维配合，尚未执行。

## 背景

客户反馈三件事：

- 只选一个月，导出 13.5 万行、文件 8 MB，等了 8 分钟还没下来，一直转圈
- 导出 70 万行要 1–2 分钟
- 「SPU市占表」点导出直接卡死（该表是平表，不是透视表，17 列里约 10 个数值指标、1 个形如 `20260901` 的数字型时间列）

## 时间花在哪里

一次导出是串行三段，任何一段慢都表现为"转圈"：

1. 前端取 queryUuid。选「表格结果」时复用页面上已经查过的 query（不重查）；选「所有结果」时会用 `LIMIT 2147483647` 重新执行一次查询，SQL 变了所以缓存必然不命中。
2. 后台任务把结果转成 CSV/XLSX，再上传 OSS。这一段的代码在 scheduler worker 里，而 worker 与 API 跑在同一个进程。
3. 浏览器下载生成好的文件。

排查后确认的四个主要原因：

- 每个单元格都新建一个 `Intl` 格式化器。数值格 18–33 µs，时间戳格 52–58 µs，几十万行乘十几列就是分钟级。
- 透视导出是先把整个文件读成数组、全字段格式化一遍、再建三份「行 × 列」矩阵、拼成一个完整字符串、再复制成 Buffer 上传，峰值内存是数据量的 5–6 倍。
- 导出任务和 API 同进程。上面那段同步 CPU 一跑，这台 pod 的 HTTP 请求全部排队，连轮询任务状态的接口都答不上，用户看到的就是卡死。
- 前端轮询没有超时。任务如果因为进程被杀停在 started，界面会一直转圈到用户刷新页面。

顺带发现两个小问题：JSONL 中间结果不压缩；非透视 CSV 完全没有行数上限。

## 已经做完的（dev 分支，镜像 2.5.6）

代码层面的改动：

| 改动 | 效果 | 位置 |
|---|---|---|
| 复用 `Intl.NumberFormat` 实例（按 locale + options 缓存） | 数值格 18–33 µs → 0.7–1.7 µs | `packages/common/src/utils/formatting.ts` |
| 时区日期格式化抽成一份实现并缓存 `Intl.DateTimeFormat`，`format()` 替代 `formatToParts()` | 52–58 µs → 2.5 µs | `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.ts` |
| `formatItemValue` 里 `getCustomFormat` 改为惰性求值 | 字符串/布尔/日期列不再白建对象 | `formatting.ts` |
| 格式表达式（XLSX 每格都会算）按内容缓存 | 货币格 ~70 µs → ~2 µs | `formatting.ts` |
| 透视 CSV 改为流式写盘 + 文件流上传，去掉整串字符串和两次 Buffer 拷贝 | 峰值内存降 50–70% | `PivotTableService.ts` |
| 透视 XLSX 改 `WorkbookWriter` 落盘；列宽由扫全表改为采样 200 行 | 内存从"整本工作簿"降到常数级 | `ExcelService.ts` |
| 非透视 XLSX 关掉 `useSharedStrings`、行用数组写入 | 17 列实测 59.3 → 37.8 µs/行，70 万行 41 s → 26 s | `ExcelService.ts` |
| 结果 JSONL 可 gzip（`RESULTS_JSONL_GZIP=true`） | 10 万行 34 MB → 4 MB，压缩/解压各约 0.1 s | `S3ResultsFileStorageClient.ts` |
| 非透视 CSV 增加行数上限 `EXPORT_MAX_ROWS`（默认 100 万） | 命中时置 `truncated`，前端提示且文件名带 `incomplete_results-` | `parseConfig.ts`、`CsvService.ts` |
| 前端：查询/任务轮询加 20 分钟截止；导出提示显示已处理秒数；拿不到文件地址时明确报错 | 不再无限转圈、不再静默失败 | `executeQuery.ts`、`useScheduler.ts`、`ExportResults/index.tsx` |

整行耗时（20 列：12 字符串 + 2 时间戳 + 1 日期 + 5 指标）从 288.4 µs 降到 21.9 µs，13 倍左右。按此推算 13.5 万行的纯格式化耗时从 39 秒降到 3 秒，70 万行从 202 秒降到 15 秒。

需要注意这只是"格式化和写文件"这一段，数仓查询时间没有变化。

## 导出给用户的东西有没有变

没有。

- 客户拿到的仍然是明文 CSV / XLSX。gzip 只作用在 OSS 上的中间 JSONL 文件，读的时候在 `getDowloadStream` 一处自动解压，导出产物不压缩。
- 数值、百分比、货币、日期时区的格式化逻辑没有改，只是不复用旧实现里每次都新建的格式化器。
- `EXPORT_MAX_ROWS` 默认 100 万，与现网 `LIGHTDASH_QUERY_MAX_LIMIT=1000000` 一致，正常导出不会触发截断。

回测方式（都在仓库里，`BENCH=1` 可跑基准）：

- `packages/common/src/utils/formatting.bytecompat.test.ts`：124 种格式 × 23 种值 = 2852 组，新旧实现逐字节比对
- `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.test.ts`：7 个时区 × 21 个时间点 × 2 种模式，含午夜、夏令时前后、闰日、毫秒补零
- `packages/backend/src/services/CsvService/CsvService.stream.test.ts`：gzip 源与明文源导出的 CSV 逐字节相等；截断产物是完整导出的逐字节前缀
- `packages/backend/src/services/ExcelService/ExcelService.stream.test.ts`：用 exceljs 读回产物，单元格值和 `numFmt` 不变
- `packages/backend/src/clients/ResultsFileStorageClients/S3ResultsFileStorageClient.test.ts`：gzip 对象自动解压，存量明文对象照常读
- `packages/backend/src/services/PivotTableService/PivotTableService.csv.test.ts`：透视 CSV 与一次性 stringify 的结果逐字节一致

## 还能做，但收益有限

这些评估过，暂时不做：

- 导出跳过 JSONL 往返（查询时同时写 JSONL 和 CSV，导出任务只取 URL）。gzip 上线后中间文件只剩二十几 MB，省下的读时间大概 1–5 秒，不值得为此改造链路、复刻权限和字段映射，风险大于收益。
- 透视表选「所有结果」时按导出口径限制查询行数，避免拉回全表再截断。收益随表大小线性增长，但边界差一行就会少数据，需要产品确认口径。
- 透视转换下放 worker_thread。解决的是"导出拖慢同机 HTTP"，属于体验问题；拆进程能覆盖大部分场景。
- `getResultsPageFromS3` 每次翻页从文件头扫。这是看板翻页慢的问题，和导出无关，需要给结果文件加行索引。
- exceljs 本身的写入速度（17 列约 33 µs/行）。如果客户能接受 CSV，同数据量下 CSV 比 XLSX 快一倍以上。

## 需要运维配合的事项

### 1. 预发

配置已在 `k8s-config` 的 `pre` 分支，镜像已指到 2.5.6：

```bash
git pull
kubectl -n pre apply -f lightdash/lightdash-config.yaml
kubectl -n pre apply -f lightdash/lightdash.yml
kubectl -n pre rollout status deploy/lightdash
```

注意 pre 原来跑的是 0.1861.5，跳到 2.5.6 会执行大量迁移，执行前先备份 RDS 的 `lightdash_pre` 库。

`utils/k8s-apply` 校验的命名空间是 `tars-pre`，和这些文件的 `pre` 不一致，会直接退出，所以只能手动 apply。

### 2. 生产

配置已在 `k8s-config` 的 `master` 分支，镜像仍是 0.2091.11，没有动：

```bash
git pull
kubectl -n default apply -f lightdash/lightdash-config.yaml
kubectl -n default apply -f lightdash/lightdash-internal/lightdash-internal-config.yml
kubectl -n default apply -f lightdash/lightdash.yml   # 仅当同时发版改 image
kubectl -n default rollout restart deploy/lightdash deploy/lightdash-internal
```

本次 master 的改动：加了 `resources`（requests 500m/2Gi，limits 4 CPU/8Gi）、`NODE_OPTIONS=--max-old-space-size=6144`、`SCHEDULER_JOB_TIMEOUT=1200000`、日志级别从 debug 降到 info、删掉重复的 `SCHEDULER_ENABLED`、S3 endpoint 切到内网。

`resources` 的 limits 是按"导出是 CPU 重活"估的，apply 前用 `kubectl describe node` 确认节点余量。requests 只有 500m/2Gi，不会影响调度。

### 3. S3 走内网

已经改了生产配置：`S3_ENDPOINT` 从 `https://oss-cn-hangzhou.aliyuncs.com` 换成 `https://oss-cn-hangzhou-internal.aliyuncs.com`，`lightdash` 和 `lightdash-internal` 都改了。浏览器下载仍走 `S3_PUBLIC_ENDPOINT`，不受影响。

依据是同集群 prod 命名空间有 26 个应用在用内网 endpoint，桶都在 cn-hangzhou 同账号。桶 `qmgy-report` 若不在杭州，现在用的公网杭州 endpoint 早就报跨区错误了。

重启后确认一下没有 S3 相关报错：

```bash
kubectl -n default logs -f deploy/lightdash | grep -i s3
```

回滚就是把这一行改回公网地址再 apply + restart。存量对象的位置没有变，不需要迁移数据。

### 4. 结果文件单独放，并加生命周期规则

现在结果 JSONL 落在业务桶 `qmgy-report` 的根目录，而 `S3_PUBLIC_ENDPOINT`（`report-assets.brandct.com`）是公共读域名。建议给结果文件单独一个桶，或者至少加前缀：

```
S3_PATH_PREFIX: results
```

注意这个前缀对所有 S3 写入都生效（截图、导出文件等），改了以后新对象都在新路径下，存量对象位置不变、预期下载链接仍然可用。

另外，`cleanQueryHistory` 只删数据库行，不删 OSS 对象，存储会一直涨，需要给桶配生命周期规则。

### 5. 把 scheduler 从 API 进程拆出去

现在 `SCHEDULER_ENABLED=true` 让 API 进程内也跑 worker，导出的 CPU 会和 HTTP 抢同一台 pod。做法是新增一个 Deployment 跑 `node dist/scheduler.js`，主 pod 设 `SCHEDULER_ENABLED=false`。

邮件、订阅、gsheet 这些任务要留在会消费它们的节点上。如果要按任务类型分节点，用 `SCHEDULER_INCLUDE_TASKS` 白名单，`SCHEDULER_INCLUDE_TASKS` 和 `SCHEDULER_EXCLUDE_TASKS` 不能同时设，同时设会启动失败。`generateDailyJobs` 和 `cleanQueryHistory` 是 cron 任务，至少要有一个节点 include，否则 `query_history` 没人清理。

### 6. 数据库

`query_history` 实测 23.5 万行、2.4 GB（每行约 10 KB，因为存了 `compiled_sql`、`metric_query`、`fields`）。排查时不要对大文本列用 `LIKE`，会卡住，按 `created_at` 缩窗口再过滤。

### 7. 监控

现在导出阶段没有分阶段耗时指标，改完说不清快了多少。建议加三个：导出任务总时长、各阶段耗时（读 JSONL / 格式化 / 上传）、峰值 RSS。Prometheus 已经在跑，队列长度指标是现成的。

## 关于 `RESULTS_JSONL_GZIP`

- 默认关闭。不设或设 `false` 都是明文 JSONL，和以前一样。
- 设 `true` 后 OSS 上的中间结果压缩，导出产物不受影响。
- 开启前要接受一个约束：开之后如果回滚到不支持 gzip 的老镜像，那段时间写入的对象老代码读不了（会把压缩字节当文本解析，逐行报错跳过，导出只剩表头）。默认 TTL 是一天，等一天让对象过期再回滚，或者干脆不回滚。
- pre 已经设成 `true`，生产显式写的是 `false`，验证完再改。

## 怎么验证有没有效果

导出时看两个数就够：

1. 浏览器开发者工具里 `GET /api/v2/projects/<p>/query/<uuid>` 的响应里有 `initialQueryExecutionMs`，这是数仓耗时。
2. 从 `POST .../schedule-download` 到任务状态变 `COMPLETED` 的间隔，是导出总时长。两者相减就是格式化和写文件的时间。

如果数仓耗时占了大部分，说明慢在仓库查询，拿 `query_history.compiled_sql` 去 Hologres 跑 `EXPLAIN ANALYZE`，靠改 dbt 或加分区解决，代码这边再怎么优化也没用。
