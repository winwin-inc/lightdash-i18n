# 导出优化 Phase 2 方案（#19 / #23 / #24 / #12）

**状态**：草案（待评审）
**前置**：Phase 1（格式化缓存 + 透视流式落盘 + 前端轮询兜底）已合入 `feat/export-perf`（镜像 `2.5.5`）
**关联**：[归因评估](./csv-export-performance.md) · [打标清单](./csv-export-optimization-status.md)

## 0. 结论速览

| 项 | 能否优化 | 结论 | 收益（本机实测/推算） | 工作量 | 风险 |
|---|---|---|---|---|---|
| **#23 JSONL gzip** | ✅ **能，且最划算** | 写侧 gzip、读侧按 `GetObject` 返回的 `ContentEncoding` 自动解压；存量明文零影响 | 34.2 MB/10 万行 → **4 MB（12%）**；gzip 仅 0.07 s、gunzip 0.06 s ⇒ 70 万行省 **~210 MB** 读写，CPU 代价 ~0.5 s | **0.5–1 人日** | 低 |
| **#24 CSV 行数兜底** | ✅ 能 | 新增 `EXPORT_MAX_ROWS`（默认 1,000,000，与其 XLSX 上限一致），命中即 `truncated=true` + 文件名带 `incomplete_results-` | 不省时间，**防一次导出打爆 pod**；对当前配置（`QUERY_MAX_LIMIT=1000000`）**无可感知变化** | **0.5 人日** | 低（默认值与现网行为对齐） |
| **#12 非透视 XLSX** | ✅ 能，但天花板在 exceljs | 去掉每行对象/key 拼接、正则预编译、试 `useSharedStrings:false` | 实测 exceljs 地板价 **33.5 µs/行**（700k≈23 s）；本项预计再省 **5–15%** | **1 人日** | 低–中（列错位/样式） |
| **#19 跳过 JSONL 往返** | ⚠️ **有条件能** | 只推荐 **tee 变体**（查询时同时写 JSONL + CSV，导出 job 只取 URL）；**不推荐**"job 内自编译 SQL"和"复用 compiled_sql 重跑" | 省一次全量 OSS 读 + 一次 `JSON.parse`（70 万行约 **10–40 s**） | **3–5 人日**（含前端） | 中–高（契约/失败语义） |

**建议上线顺序**：#23 → #24 → #12 →（用真实数据证明 #19 值得再做）#19。

---

## 1. #23：JSONL 落 OSS 压缩（推荐先做）

### 1.1 现状
- 写：`S3ResultsFileStorageClient.createUploadStream`（`clients/ResultsFileStorageClients/S3ResultsFileStorageClient.ts:43-118`）逐行 `passThrough.push(JSON.stringify(row) + '\n')`，用 `@aws-sdk/lib-storage` 的 `Upload` 分片上传，**无压缩**。
- 读：`getDowloadStream`（`:120-138`）→ `getResults()` 直接返回 `Body`。

### 1.2 设计（两处改动，读侧集中）

**写侧**（`createUploadStream`）：
```
const gzip = createGzip({ level: 3 });          // level 1~3 足够，见实测
const upload = new Upload({ params: {
    Bucket, Key: prefixedKey,
    Body: gzip,                                  // 用压缩流做 Body
    ContentType: opts.contentType,
    ContentEncoding: 'gzip',                     // ← 关键标记
    ContentDisposition, ...
}});
write(rows)  →  逐行 gzip.write(json+'\n')，返回 false 时等 drain（顺带修 #10 背压）
close()      →  gzip.end(); await upload.done()
```

**读侧**（`getDowloadStream`，只改这一处）：
```
const results = await this.getResults(cacheKey, fileExtension);
const body = results.Body as Readable;
return results.ContentEncoding === 'gzip' ? body.pipe(createGunzip()) : body;
```

- 依据：`GetObject` 的响应里**自带 `ContentEncoding` 字段**（AWS SDK v3 `GetObjectOutput.ContentEncoding`），不需要额外 `HeadObject`，也不需要改文件名/新增列。
- 兼容：存量对象没有该字段 → 走原路径，**天然向后兼容**；回滚只需把写侧的 `ContentEncoding` 去掉（旧数据仍可读）。

### 1.3 覆盖到的读点（都经过 `getDowloadStream`，无需逐个改）
`CsvService.streamJsonlRowsToFile`、`ExcelService.downloadAsyncExcelDirectly` / `downloadAsyncPivotTableXlsx`、`PivotTableService.downloadAsyncPivotTableCsv`、`S3ResultsFileStorageClient.transformResultsIntoNewFile`、`AsyncQueryService.getResultsPageFromS3`（分页）、`getResultsStream`。

> 唯一不受益但也不受影响：`AsyncQueryService.downloadAsyncQueryResultsAsJson`（若直接取 `Body` 需确认走的是 `getDowloadStream`）。

### 1.4 实测（本机，17 列 × 10 万行 JSONL = 34.2 MB）

| level | 压缩后 | 压缩比 | gzip 耗时 | gunzip 耗时 | 70 万行推算 |
|---|---|---|---|---|---|
| 1 | 4.2 MB | 12% | 69 ms | 60 ms | gzip 0.5 s / gunzip 0.4 s |
| 3 | 4.1 MB | 12% | 125 ms | 47 ms | gzip 0.9 s / gunzip 0.3 s |
| 6 | 3.7 MB | 11% | 263 ms | 48 ms | gzip 1.8 s / gunzip 0.3 s |

推荐 **level 3**：压缩比已经和 6 差不多，CPU 只有一半。

### 1.5 风险
- **CPU 与查询争抢**：gzip 在这条流上是同步机会点，但实测 10 万行仅 125 ms，相对数十秒的查询可忽略；
- **分片上传**：`lib-storage` 以 5 MB 分片读取压缩流，压缩比越高、同上行数分片越少，行为正常；
- **缓存键**：不需要改 key（同一个 `results_file_name` 只是内容变了），但**同一 cacheKey 的老记录仍指向明文对象**，读侧靠 `ContentEncoding` 兼容，无需版本化。

---

## 2. #24：非透视 CSV 行数兜底 + `truncated` 语义修正

### 2.1 现状（问题）
`CsvService.streamJsonlRowsToFile`（`CsvService.ts:412-490`）调 `streamJsonlData` **不传 `maxLines`** → 非透视 CSV **完全没有上限**，`truncated` 恒 `false`。而 XLSX 有 `EXCEL_ROW_LIMIT = 1_000_000`（`ExcelService.ts:37`）。一次"所有结果"导出如果命中千万行，会把单 pod 内存/磁盘/上传全打满。

### 2.2 设计
1. 新增配置 `EXPORT_MAX_ROWS`（`parseConfig.ts` 的 `query` 段），默认 **1,000,000**。
   - 为什么默认 100 万：与 XLSX 上限、与他们现网 `LIGHTDASH_QUERY_MAX_LIMIT=1000000` 对齐 ⇒ **现网无可感知变化**，只是把"无上限"变成"有保护"。
   - 为什么不用 `csvCellsLimit/列数`：那会把"所有结果=100 万行"的预期压到 58 万（17 列），是行为变更，不适合做默认。
2. `streamJsonlRowsToFile` 增加 `maxLines` 参数 → 传给 `streamJsonlData`（`FileDownloadUtils.ts:158-218` 已支持 `maxLines` 且会返回 `truncated`）。
3. 命中上限时：`truncated=true` → 前端现有提示（"导出结果被限制"）+ 文件名 `incomplete_results-` 前缀（`FileDownloadUtils.ts` 已实现）。
4. 同时修 `couldBeTruncated` 的语义（`CsvService.ts:581-590`）：现在只是"估算"用于打标，改为以 `truncated` 为准。
5. 前端（可选，后续）：导出弹窗里显示"预计导出 N 行 / 上限 M 行"。

### 2.3 验收
- 造一份 1,000,010 行的结果文件 → 导出 CSV 应恰好 1,000,000 行 + 弹提示 + 文件名带 `incomplete_results-`；
- 1,000,000 行以内 → 与改动前**逐字节一致**。

### 2.4 风险
- 用户可能"突然少数据"：靠"必须 `truncated=true` + 明确文案 + 文件名标记"来兜；默认值与现网一致，所以实际上不会触发。

---

## 3. #12：非透视 XLSX 行写入优化

### 3.1 现状与地板价
- 代码：`ExcelService.streamJsonlToExcelFile`（`:526-620`）→ `convertRowToExcel`（`:214-320`）→ `worksheet.addRow({col_0: v, ...})` → `row.commit()`。
- **本机实测（17 列 × 10 万行，纯 `addRow`+`commit`，不做任何格式转换）= 33.5 µs/行、≈3 万行/秒、文件 10.3 MB**；700k 行**光 exceljs 写文件就要 ≈23 s**。
  → 也就是说：**XLSX 的时间天花板在 exceljs 本身**，我们的代码最多影响 20–30%。

### 3.2 可做的零语义改动
| 改动 | 位置 | 预期 |
|---|---|---|
| `addRow(array)` 替代每行构造 `{col_i: v}` 对象 | `:582-596` | 每行省一次对象 + 17 次字符串键拼接 |
| 正则提到模块级（`convertToExcelDate` / `isCalendarDateDisplayValue` / `toExcelMonthPeriod`） | `:172-210` | 每格省一次正则编译 |
| 每格的 `getFormatExpression(item)` 已经在 Phase 1 加了缓存，无需再改 | — | — |
| 试 `useSharedStrings: false`（需基准确认，可能更快但文件更大） | `:536` | 待测 |
| 日期格的 `new Date(String(v))` 复用（同一格只解析一次） | `convertRowToExcel` | 小 |

### 3.3 不要动
`worksheet.columns[].style.numFmt`、表头样式、列宽策略 —— 这些是**产品可见行为**（用户打开 Excel 看到的格式），不属于性能优化范围。

### 3.4 验收
同一份数据导出 XLSX，用 `openpyxl` 逐单元格比对新旧文件的**值**（样式不比对），并记录耗时/体积。

---

## 4. #19：跳过 JSONL 往返（最重，建议最后做）

### 4.1 三个变体对比

| 变体 | 做法 | 数仓查询次数 | OSS 写 / 读 | 结论 |
|---|---|---|---|---|
| **A. tee（推荐）** | 查询时同时写 JSONL **和** CSV 两个对象；导出 job 只返回 CSV 的 URL（不再读 JSONL） | **1**（不变） | 写 2（JSONL + CSV），**读 0** | ✅ 省一次全量读 + 一次 `JSON.parse` |
| B. job 内自编译 SQL 直出 | 前端不再预跑查询，导出 job 里编译 SQL 并流式写 CSV | **1** | 写 1，读 0 | ⚠️ 必须复刻 `view Project`/`view Explore`/`manage CustomSql`/`getUserAttributes`/`getFilteredExplore`/dashboard 上下文/参数合并（`AsyncQueryService.ts:1600-1680, 2043-2140`），**风险最高** |
| C. job 内复用 `compiled_sql` 重跑 | 从 `query_history.compiled_sql` 取 SQL 再查一次 | **2**（更差） | 写 1，读 0 | ❌ 把负担转给数仓，不划算 |

### 4.2 推荐：A（tee）的具体形态

1. **前端**（`components/ExportResults/index.tsx:131-153`）：把 `downloadOptions` 的构造**提前**到 `getDownloadQueryUuid` 之前，并随查询请求一起发（新增可选字段 `export: { type, onlyRaw, customLabels, columnOrder, hiddenFields, showTableNames }`）。
2. **后端查询执行**：`AsyncQueryService.runAsyncWarehouseQuery`（`:1351-1520`）在 `write` 回调处多开一条 CSV 上传流：
   - 表头由 `processFieldsForExport(fields, options)` 一次性算出（**不依赖数据**，所以非透视可行）；
   - 每行复用 **同一个** `convertRowToCsv` ⇒ 产物与现在的导出**逐字节一致**（同一函数）；
   - 对象名可由现有 `results_file_name`（`QueryHistoryModel.createUniqueResultsFileName`，`:78-80`，无扩展名）派生，例如 `${resultsFileName}` + 扩展名 `csv` ⇒ **不需要改数据库**。
3. **导出 job**（`AsyncQueryService.downloadAsyncQueryResults`，`:860-1045`）：先看对象是否存在（`HeadObject`），存在则直接 `getFileUrl` 返回 `{ fileUrl, truncated }`；不存在（例如透视、或查询时未带 export 选项）→ **回退到现在的 JSONL 转换路径**。这条回退保证了完全兼容。
4. **透视表不做 tee**：列集合要等流结束才知道，继续走现有路径。

### 4.3 失败/取消语义（必须写清）
- 查询中途失败 → 已写的 CSV 对象是半成品：job 在返回 URL 前**必须**校验 `query_history.status === 'ready'`，否则走回退或直接报错；
- `Content-Length`/对象大小不做承诺；`truncated` 与本轮 `EXPORT_MAX_ROWS` 一致；
- job 超时（20 min）仍按现有 `tryJobOrTimeout` 处理，但此时 CSV 已由查询侧产出，回退路径不应重复生成。

### 4.4 工作量与风险
- 前端 1 人日（选项提前 + 请求体字段）、后端 2–3 人日（第二条流 + 对象命名 + job 分支 + 回退）、测试 1 人日；
- 最大风险：**两个流共用一个 `write` 回调时的背压**（任一慢都会拖慢查询）。设计上必须让 CSV 流"可丢可等"：优先让 JSONL 流正常推进，CSV 流用独立 backpressure 等待且失败时降级（记 warning + 让 job 走回退）。

### 4.5 收益量化（70 万行 / 17 列 / 342 B/行）
- 现状：写 JSONL ~240 MB + 读 ~240 MB + `JSON.parse` 70 万行（~2.5 µs/行 ≈ 1.8 s）+ 写 CSV（~80 MB）；
- tee 后：写 JSONL ~240 MB + 写 CSV ~80 MB，**省掉 240 MB 读**（内网 OSS 通常 10–30 s）+ 解析；
- 若 #23 已上线，JSONL 读写各降到 ~26 MB ⇒ **#19 的相对收益会明显变小**（这也是建议"先做 #23、用数据再决定 #19"的原因）。

---

## 5. 实施顺序与回测

| 阶段 | 内容 | 回测方式 | 预计 |
|---|---|---|---|
| P2-1 | #23 gzip（+ 顺带 #10 背压） | ①同一查询新旧导出 **byte-diff**；②写入/读取字节数与耗时；③存量明文对象仍可读（用老 key 手工验证一次） | 0.5–1 人日 |
| P2-2 | #24 行数兜底 | 造 1,000,010 行 → 行数=1,000,000 + `truncated` + 文件名前缀；1,000,000 行内 byte-diff | 0.5 人日 |
| P2-3 | #12 XLSX | `openpyxl` 逐格比对值；耗时/体积前后对比；确认列不错位、表头样式不变 | 1 人日 |
| P2-4 | #19 tee（非透视） | ①同一图表三种档位（表格/所有/自定义）导出 byte-diff；②失败注入（kill 查询）验证回退；③与回退路径耗时对比 | 3–5 人日 |

**统一回测基线**：pre 环境 + 同一张「SPU市占-全量模型」（17 列、约 10 数值列），分别记录 CSV / XLSX 的 `job_sec`、`initialQueryExecutionMs`、pod 峰值内存、产物行数与 md5。

## 6. 需要先确认的 3 个决策

1. **#24 默认上限**：`EXPORT_MAX_ROWS=1,000,000`（与现网 `QUERY_MAX_LIMIT` 一致，无感知）是否可接受？还是给一个更低值（如 50 万）换取更稳的内存？
2. **#19 是否值得做**：等 #23 上线后测一次——如果 CSV 导出的"非查询耗时"已经降到 10 s 内，那 #19 的收益（10–30 s）就不值得那 3–5 人日的风险。
3. **XLSX 是否引导用 CSV**：大数据量时是否在弹窗提示"建议使用 CSV"（0 代码风险、立刻见效，省掉 exceljs 那 23 s/70 万行）。
