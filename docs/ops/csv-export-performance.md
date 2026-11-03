# 导出优化清单

## 功能实现

代码（`feat/export-perf`，已合入 dev）：

- [x] 数值格式化复用 `Intl.NumberFormat` 实例（按 locale + options 缓存）——数值格 18–33 µs → 0.7–1.7 µs
- [x] 时区日期格式化合并成一份实现并复用 `Intl.DateTimeFormat` —— 52–58 µs → 2.5 µs/格
- [x] `formatItemValue` 里 `getCustomFormat` 改惰性求值
- [x] 格式表达式按内容缓存（XLSX 每格都会调用）——货币格 ~70 µs → ~2 µs
- [x] 透视 CSV 改流式写盘 + 文件流上传，去掉整串字符串与两次 Buffer 拷贝——峰值内存降 50–70%
- [x] 透视 XLSX 改 `WorkbookWriter` 落盘，列宽由扫全表改为采样 200 行
- [x] 非透视 XLSX 关 `useSharedStrings`、行用数组写入——17 列 59.3 → 37.8 µs/行
- [x] 结果 JSONL 支持 gzip（`RESULTS_JSONL_GZIP`）——10 万行 34 MB → 4 MB，仅压中间文件
- [x] 非透视 CSV 加行数上限（`EXPORT_MAX_ROWS`，默认 100 万），命中置 `truncated`
- [x] 前端导出：轮询加 20 分钟截止、提示显示已处理秒数、拿不到文件地址时报错
- [x] 回测用例：格式化 byte-diff（2852 组）、时区日期（7 时区 × 21 时间点）、gzip/明文 CSV 逐字节比对、截断产物为完整导出的前缀、XLSX 值与 `numFmt`、透视 CSV 逐字节

配置（`k8s-config`）：

- [x] pre：`resources` 500m/2Gi、2 CPU/8Gi；`NODE_OPTIONS=--max-old-space-size=6144`；`SCHEDULER_JOB_TIMEOUT=1200000`；日志 `info`；`S3_ENDPOINT` 内网；`RESULTS_JSONL_GZIP=true`；image `2.5.6`
- [x] master：`resources` 500m/2Gi、4 CPU/8Gi；`NODE_OPTIONS` 同上；`SCHEDULER_JOB_TIMEOUT` 同上；日志 `info`；`S3_ENDPOINT` 内网（`lightdash` 与 `lightdash-internal`）；`RESULTS_JSONL_GZIP=false`
- [ ] master：image 仍是 `0.2091.11`，发版时改为含上述代码改动的版本，并决定是否把 `RESULTS_JSONL_GZIP` 置 `true`

## 待做：需要运维或数据团队配合

- [ ] **scheduler 从 API 进程拆出去**
  新增 Deployment 跑 `node dist/scheduler.js`，主 pod `SCHEDULER_ENABLED=false`。解决导出期间 API 同进程被 CPU 占满的问题。
  运维：新增 Deployment、独立资源配额；按任务类型决定是否拆两个 scheduler 节点（`SCHEDULER_INCLUDE_TASKS`）。邮件/订阅任务要留在会消费它们的节点，`generateDailyJobs`、`cleanQueryHistory` 至少一个节点要 include。
  前置：无。预估 1 人日 + 半天验证。

- [ ] **结果文件与业务资源分开存放**
  单独桶或 `S3_PATH_PREFIX`，桶上配生命周期规则；确认公共读域名只覆盖业务资源前缀。
  运维：建桶/加前缀、生命周期、域名收口。
  前置：无。预估半天。

- [ ] **导出任务单独限流**
  导出与订阅、校验、SQL Runner 共用同一个并发池，一个大导出会堵住后面的任务。
  代码：新增导出类任务的并发配置项；运维：确认每并发对应的内存配额、加队列长度告警。
  前置：在 1 之后做更有效。预估 1 人日。

- [ ] **导出阶段监控指标**
  目前没有分阶段耗时，改完说不清快了多少。需要：任务总时长、各阶段耗时（读 JSONL / 格式化 / 上传）、峰值 RSS。
  代码：打点；运维：抓取、看板、告警阈值（如 RSS 超过 limit 80%）。
  前置：无。预估 1 人日。

- [ ] **数仓侧预聚合或分区裁剪**
  `SPU市占-全量模型` 这类月粒度分析表适合做物化/预聚合；先用 `query_history.compiled_sql` 跑 `EXPLAIN ANALYZE` 看执行计划，确认是扫描量大还是 join 策略问题。
  数据团队：dbt 侧改动。应用层改不了这块，但它决定客户体感上限。
  前置：先测出数仓耗时的占比。

- [ ] **透视表「所有结果」按导出口径限制查询行数**
  现在是拉回全表再截断，被截掉的部分白查白写。
  产品：确认口径（边界差一行就会少数据）。代码：前后端共用一个上限函数并加行数断言。
  前置：口径确认。预估 1 人日。

- [ ] **导出链路跳过 JSONL 往返**
  查询时同时写 JSONL 和 CSV，导出任务只返回 URL；或前端不预跑查询，导出任务自己编译 SQL 出文件（后者要复刻权限、用户属性、dashboard 上下文、参数映射）。
  代码 3–5 人日，风险最高。
  前置：gzip 之后中间文件只剩二十几 MB，省下的读时间约 1–5 秒，建议在 1、2 完成、数据量再上一个台阶后再评估。

- [ ] **大数据量时提示改用 CSV**
  同数据量下 CSV 比 XLSX 快一倍以上（省掉 exceljs 约 23 秒/70 万行）。
  产品：文案。零代码风险。预估 0.5 人日。

## 注意

- `RESULTS_JSONL_GZIP` 开启后，回滚到不支持 gzip 的老镜像会读不了那段时间写入的对象（压缩字节被当文本解析，逐行报错跳过，导出只剩表头）。默认 TTL 一天，等对象过期再回滚。
- `SCHEDULER_JOB_TIMEOUT` 和前端 20 分钟截止都只改状态，超时后底层任务仍在跑，不释放 CPU 与内存。
- `query_history` 实测 23.5 万行、2.4 GB（每行约 10 KB）。排查时不要对大文本列用 `LIKE`，按 `created_at` 缩窗口再过滤。
- 非透视 CSV 以前没有行数上限，现在默认 100 万；需要更多调 `EXPORT_MAX_ROWS`，不要去掉限制。
