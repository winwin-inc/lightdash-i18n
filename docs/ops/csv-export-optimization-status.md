# 导出（CSV/XLSX）优化：打标清单与分工

**状态**：进行中（部分已实施、部分待开发、部分需运维配合）
**关联**：[导出性能归因评估](./csv-export-performance.md)（根因与证据）

本文件只做一件事：**把每一项优化打上状态标，标明影响、收益、风险和归属**，方便排期和交接。

## 状态图例

| 标记 | 含义 |
|---|---|
| ✅ 已实施 | 代码已合入（`feat/export-perf`，对应镜像 `2.5.5`），有测试或基准支撑 |
| 🟡 已提交待验证 | 代码或配置已提交，但还没在预发/生产跑出数据 |
| ⬜ 待开发·低风险 | 输出字节不变，纯机械改动 |
| 🧪 待开发·需护栏 | 输出必须逐字节一致，需 byte-diff 测试守住才能上 |
| 🏗 待开发·架构级 | 会改变链路或涉及行数口径，需要 A/B 与行数断言 |
| 🔧 需运维配合 | 配置/部署/存储/监控，代码侧不需要改 |
| ❌ 不做 | 评估过，投入产出不划算或会动数据口径 |

---

## 一、代码：已完成

| # | 项 | 状态 | 改了什么 | 实测/预期收益 | 证据 |
|---|---|---|---|---|---|
| 1 | 数值格式化缓存 `Intl.NumberFormat` | ✅ | 按 `locale+options` 复用实例（上限 512）；非数值保留 `toLocaleString` 原语义 | 单格 18–33 µs → **0.7–1.7 µs（13–35×）** | `packages/common/src/utils/formatting.ts`（`formatNumberValue`） |
| 2 | 时区日期格式化共享 + 缓存 | ✅ | 新增单一实现，缓存 `Intl.DateTimeFormat`，`format()` 替代 `formatToParts()`，带 ICU 自检回退 | 单格 52–58 µs → **2.5 µs（23×）** | `packages/backend/src/utils/FileDownloadUtils/formatMomentByTimezone.ts` |
| 3 | `formatItemValue` 惰性解析 customFormat | ✅ | 字符串/布尔/日期列不再白建 2–3 个对象 | 非数值列每格省一次分配 | 同上（`formatItemValue`） |
| 4 | 格式表达式按内容缓存 | ✅ | `convertCustomFormatToFormatExpression` 结果缓存（XLSX 里每格都会调） | 货币格 2×`Intl`（~70 µs）→ 查表（~2 µs） | `formatting.ts` |
| 5 | 透视 CSV 流式落盘 | ✅ | 去掉「整串 `stringify` + `Buffer.from` + `Buffer.concat`」，改 `pipeline` 逐行写；S3 用文件流上传 | 峰值内存 **-50%~70%**，去掉 0.5–3 s 同步序列化 | `PivotTableService.ts` |
| 6 | 透视 XLSX 流式落盘 | ✅ | `WorkbookWriter` 落盘替代内存 workbook + `writeBuffer` + `Buffer.from`；列宽改采样 200 行 | 内存从"整本工作簿"降到常数级 | `ExcelService.ts` |
| 7 | 删除重复的时区格式化实现 | ✅ | `CsvService` / `ExcelService` 各自一份副本合并为一处 | 维护成本 | 两个 service |
| 8 | 前端轮询兜底 + 计时提示 | ✅ | 查询/任务轮询加 20 分钟 deadline；toast 显示已处理秒数；`fileUrl` 为空时明确报错 | 消灭"永远转圈/静默失败" | `frontend/.../executeQuery.ts`、`useScheduler.ts`、`ExportResults/index.tsx` |
| 9 | byte-diff 与基准测试 | ✅ | 数值 2852 组、时区 7×21×2、透视 CSV 逐字节、BENCH 基准（`BENCH=1` 触发） | 后续改动的机械护栏 | `formatting.bytecompat.test.ts`、`formatMomentByTimezone.test.ts`、`PivotTableService.csv.test.ts`、`exportPipeline.bench.test.ts` |

**整行实测（20 列：12 字符串 + 2 时间戳 + 1 日期 + 5 指标）**：288.4 µs/行 → **21.9 µs/行（13.2×）**；外推 13.5 万行 39 s → 3 s，70 万行 202 s → 15 s。

## 二、代码：待开发·低风险（输出字节不变）

| # | 项 | 状态 | 收益 | 备注 |
|---|---|---|---|---|
| 10 | S3 上传流补背压（等 `drain`） | ⬜ | 不改耗时，**降峰值内存**、防 OOM | `S3ResultsFileStorageClient.createUploadStream` 的 `write()` 目前丢弃 `push()` 返回值 |
| 11 | `streamJsonlRowsToFile` 手写 pump → `pipeline` | ⬜ | 内存有界 + 修掉"慢 sink 可能丢行" | `CsvService.ts`，照抄 `streamObjectRowsToFile` |
| 12 | Excel 正则预编译 + `addRow(array)` | ⬜ | Excel 导出 1–3% | `ExcelService.convertRowToExcel` / `streamJsonlToExcelFile` |
| 13 | `formatNumberValue` 的 `JSON.stringify(options)` 每格一次 → 按 format 对象身份缓存 | ⬜ | 700k×5 列约 1 秒 | 用 `WeakMap<CustomFormat, Intl.NumberFormat[]>` |
| 14 | `formatRow` 每行 `Object.keys(row)` → 按查询预计算字段表 | ⬜ | ~0.5–1 µs/行 | `common/src/index.ts` |
| 15 | 删除死代码 `escapeCsvValue` / `processJsonLineToCsv` | ⬜ | 0（防误用） | `CsvService.ts` |

## 三、代码：待开发·需 byte-diff 护栏

| # | 项 | 状态 | 适用哪些表 | 预期收益 | 风险点 |
|---|---|---|---|---|---|
| 16 | `formatDate` / `formatTimestamp` / `formatRawValue` 的 `moment` → 缓存 `Intl` | 🧪 | **含 DATE/TIMESTAMP 维度的表**（按月/按日/下单时间；你们"month_2"这类分析表正中） | 每格 23–26 µs → ~2 µs；日期列多的表整行 **-25%~30%**；纯字符串/整数表收益接近 0 | 输出必须逐字节一致：午夜（`24:00` vs `00:00`）、DST 边界、闰日、毫秒补零、各 `timeInterval` 格式 |
| 17 | 按列预编译 formatter | 🧪 | **列多（>10 列）且行数大的宽表** | 21.9 → 约 15 µs/行（1.4×） | 表计算/自定义 SQL 维度/`null`/`NaT`/`∅`/`-` 等分支要逐一覆盖；保留 `formatItemValue` 作兜底 |

**怎么判断你自己的表值不值得做**：拿单行耗时估算
```
行数 × [ 日期列数 × 23µs + 数值列数 × 1.3µs + 其他列数 × 0.25µs + ~5µs 固定开销 ]
```
- 日期列 ≥ 2 且行数 ≥ 10 万 → #16 明显值；
- 列数 ≥ 20 且行数 ≥ 30 万 → #17 值；
- 全是字符串/整数、列数 < 10 → 两项都不值。

## 四、代码：待开发·架构级（会碰"口径/链路"，需 A/B）

| # | 项 | 状态 | 收益 | 前置条件 |
|---|---|---|---|---|
| 18 | 透视表「所有结果」把查询上限对齐导出口径 `floor(csvCellsLimit/字段数)` | 🏗 | 现在会拉全表再截断，被截掉的行是白查白写；表越大省得越多 | 前后端用同一常量；加"截断前后行数一致"断言 |
| 19 | 导出 job 直连数仓流式出 CSV/XLSX（跳过 JSONL 回读） | 🏗 | 省一次全量 OSS 读（700k 行约 200 MB，10–40 s） | 复刻权限/用户属性/dashboard 上下文/参数字段映射/时区；建议先只做非透视 |
| 20 | 透视转换下放 `worker_thread` | 🏗 | 导出期间不再堵住 HTTP 事件循环 | worker 内直接读 JSONL，不要 clone 大数组 |
| 21 | `pivotQueryResults` 合并 3 份矩阵 + `rowTotals` 复杂度优化 | 🏗 | 宽表内存 -40%+ | 表头/总计语义逐字节回归 |
| 22 | `getResultsPageFromS3` 加行索引（sidecar / S3 Range） | 🏗 | 看板翻页 O(n²) → O(页) | 存量文件回退全扫 |
| 23 | JSONL / CSV 落 OSS 加 gzip | 🏗 | 存储与回读字节 -70%~85% | 缓存键带格式版本，存量明文兼容 |
| 24 | 非透视 CSV 的 `truncated` 语义修正 + 服务端行数兜底 | 🏗 | 防一次导出打爆 pod；提示准确 | 现在非透视 CSV **完全没有上限** |
| 25 | `convertSqlQueryResultsToCsv` 的 `Object.values(row)[i]` | 🏗 | 22.98 µs/行 → 0.22 µs（100×，SQL 图表） | 字段顺序与行键顺序需一致，改动前要验证 |

## 五、需运维 / 配置配合

| # | 项 | 状态 | 说明 |
|---|---|---|---|
| 26 | pre 的 lightdash 配置（资源上限/堆/超时/日志/内网 endpoint） | 🟡 | 已推 `k8s-config` `pre` 分支（`e10a4fd1`），**尚未 `kubectl apply`**；需按 `image=2.5.5` 一起滚动 |
| 27 | 镜像升级到 `2.5.5` | 🟡 | tag 已推，待构建完成；构建完再 apply，否则 ImagePullBackOff |
| 28 | 结果文件独立前缀或独立桶（`S3_PATH_PREFIX` / `RESULTS_S3_BUCKET`） | 🔧 | 现在结果 JSONL 落在业务桶根目录，与 `S3_PUBLIC_ENDPOINT`（公共读域名）同域；开缓存/扩容前应先分离 |
| 29 | OSS 生命周期规则 | 🔧 | `cleanQueryHistory` 只删 DB 行，**不删对象**，存储会一直涨 |
| 30 | 拆独立 scheduler Deployment（`node dist/scheduler.js`） | 🔧 | 现在 API 与 worker 同 pod，导出会拖慢 HTTP；邮件/订阅类任务必须留在会消费它们的节点上 |
| 31 | 数据库备份（迁移前） | 🔧 | pre 从 `0.1861.5` 跳 `2.5.5` 会跑大量迁移 |
| 32 | EE license 确认 | 🔧 | 决定 `RESULTS_CACHE_ENABLED` 是否可用；**无 license 时开启只走老 v1 缓存（有 OOM 风险），建议保持关闭** |
| 33 | 导出阶段埋点接入监控 | 🔧 | 建议 Prometheus 指标：`export_job_duration_seconds{stage}`、`export_peak_rss_bytes`；否则改完无法量化 |
| 34 | `query_history` 体积治理 | 🔧 | 实测 23.5 万行 / 2.4 GB（每行约 10 KB，含 `compiled_sql`+`metric_query`+`fields`）；大文本列 `LIKE` 查询会卡，排查时避免 |

## 六、不做

| 项 | 原因 |
|---|---|
| ❌ 只调 `SCHEDULER_CONCURRENCY` / `SCHEDULER_JOB_TIMEOUT` / 加 CPU 核 | 不改根因，只会让更多大任务同时压垮单 pod |
| ❌ 首屏查询直接拉全量（让 ALL 导出零查询） | 把全表扫描挪到每次打开看板，成本放大且更卡 |
| ❌ Parquet / DuckDB 重构 | 当前数据量下投入产出不划算 |
| ❌ 把透视导出降级成"只导明细" | 丢功能 |

---

## 关于"byte-diff 护栏"是什么

**问题**：上面这些优化会重写"数字/日期怎么变成字符串"的代码。一旦某个值从 `1,234.50` 变成 `1234.5`，或者 `2026-01-03 00:00:00.000` 变成 `24:00:00.000`，程序不会报错，**客户下载的 CSV 就悄悄错了**。这类事故最难发现，也最伤信任。

**做法**：在测试里保留一份**旧实现的拷贝**（oracle），用同一批输入分别跑新旧实现，**逐字节比较输出**；任何差异直接让测试失败。

```ts
// packages/common/src/utils/formatting.bytecompat.test.ts（已落地）
const expected = legacyFormatNumberValue(value, format);   // 旧实现拷贝
const actual   = formatNumberValue(value, format);         // 新实现
expect(actual).toBe(expected);                             // 逐字节
```

当前已覆盖的语料：
- 数值：124 种格式 × 23 种值 = **2852 组**（含 `NaN`/`±Infinity`/`±0`/`2^53`/空串/各货币/各分隔符/`round` 正负/紧凑单位）
- 日期：7 个时区 × 21 个时间点 × 2 种模式（含午夜、DST 前后、闰日、毫秒补零、非法值）
- 透视 CSV：含逗号/引号/换行/emoji 的单元格 + 2 万行，与"一次性 stringify"的结果逐字节比对

**所以"需要护栏"= 这项改动本身不是零风险，但风险可以被机械验证**；护栏写好了，风险就从"靠人 review"降到"测试红/绿"。没有护栏的改动（比如透视矩阵合并），我不建议动。
