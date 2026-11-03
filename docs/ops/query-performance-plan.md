# 查询性能优化方案

状态：草案，未实施。
范围：图表与看板的取数链路。导出链的改动见 [`csv-export-performance.md`](./csv-export-performance.md)。

查询耗时由三段组成：数仓执行 SQL、结果回传到服务进程、把结果写成可复用的结果文件。第一段占大头但改不动，下面四件事都在后两段，且都是代码层能落的。

## 1. 去掉可推导的 count 查询

**现象**

看板的表格 tile 如果开了分页或「显示结果总数」，前端会额外调 `/saved/:uuid/calculate-count`（`frontend/src/hooks/useCalculateCount.ts`，已按 Tab 是否访问过来门控）。后端 `_getCalculateCountQuery`（`backend/src/services/ProjectService/ProjectService.ts:6712-6745`）把整条 metric query 复制一份、去掉 LIMIT / 排序 / offset，再包成 `SELECT COUNT(*) FROM (...)`（`wrapSqlAsCountQuery`），然后**重新连一次数仓执行**。

也就是说，一个这样的 tile 每次加载打两次数仓，第二次是全量的重复聚合，代价与第一次相当，有时更高（外层 COUNT 无法利用 LIMIT 提前结束）。

**可省掉的原因**

主查询返回的行数如果小于它自己的 LIMIT，说明结果没有被截断，总数就是返回行数，不需要再查。只有"返回行数正好等于 LIMIT"时才可能还有更多，这时才需要 COUNT。

**做法**

- 后端在主查询结果里明确带出 `limit` 与 `total_row_count`（`query_history` 里两者都有），由调用方判断是否需要 COUNT。
- count 接口在"未截断"时直接返回已知行数，不再编 SQL、不再连数仓。
- 截断时保留 COUNT，但按 `(chartUuid, dashboardFilters, parameters)` 加一个短 TTL 的结果复用，避免切 Tab / 重渲染时重复计算。

**预期**

开了分页的表格看板，数仓查询数减半。具体收益取决于看板里有多少 tile 开了分页或「显示结果总数」，可以在 `query_history` 里按 `context` 统计 `calculate-count` 相关请求量来估算。

**成本与风险**

前后端各改一处，1–2 人日。风险在于 `totalRowCount` 的语义变化会直接影响分页组件（页码数、是否显示"下一页"），必须补一行断言：未截断时 `totalRowCount === rows.length`。另外要注意 pivot 结果的 `total_row_count` 存的是透视后的行数，不能直接当未透视的总数用。

## 2. 复用数据库连接

**现象**

`PostgresWarehouseClient.streamQuery`（`packages/warehouses/src/warehouseClients/PostgresWarehouseClient.ts:223-260`）每次查询都 `new pg.Pool(...)`，查完销毁。Hologres 走 postgres 协议，所以每条图表查询都要重新做一次 TCP 连接与认证握手。

**做法**

按 `(projectUuid, 凭据版本)` 缓存连接池，配置空闲回收与最大连接数；凭据变更、SSH 隧道关闭、项目配置修改时失效。也可以保留现有结构，只把 Pool 的提升到 client 生命周期。

**预期**

单条查询省一次握手（通常几十毫秒）。看板并发 20 条时，除了时间，连接数尖峰也会下降，对 Hologres 侧的连接限制更友好。

**成本与风险**

后端 2–3 人日。风险集中在生命周期：连接泄漏、凭据轮换后仍用旧连接、SSH 隧道先于连接关闭、长事务占用连接。需要配套最大连接数与空闲超时，并在 `WH` 侧确认单实例允许的连接数。

## 3. 结果分页加行索引

**现象**

`getResultsPageFromS3`（`backend/src/services/AsyncQueryService/AsyncQueryService.ts:296-378`）读第 N 页时，从文件第 0 行开始逐行读、计数到目标页为止。页数越大越慢，属于看板浏览大表的体验问题，与 SQL 无关。

**做法**

写结果文件时同步写一份行偏移索引（每 N 行记一次字节位置），读页时用 S3 Range 定位到最近的偏移再读该页。没有索引的存量文件回退到当前的全量扫，新旧路径并存。

**预期**

翻页代价从 O(前 N 页行数) 降到 O(一页行数)。

**成本与风险**

后端 2–3 人日。两个坑：一是索引与文件可能不一致（写入中断），需要行数校验后回退全扫；二是**与 gzip 冲突**——压缩流不能按行偏移跳读。结果是二选一，或者索引记录"压缩块边界→解压后行号"的映射（实现复杂度显著上升）。如果后续要长期开 gzip，这一项需要重新设计，不是一个简单的 sidecar 文件。

## 4. 导出复用页面上的查询

「表格结果」已经复用页面 query，「所有结果」会用 `LIMIT 2147483647` 重新执行一次。改法有两种：导出直接读页面那份结果文件（受页面 limit 限制，需要产品确认可接受）；或保留重跑但把上限对齐导出口径，避免拉回全表再截断。

详见导出文档的第二、三节，这里不重复。前后端各改一处，1–2 人日，风险在口径变化。

## 5. 数据层是上限

应用层这四项压缩的是"查询之外"和"重复查询"，单条 SQL 本身的耗时降不下来。这部分归数据团队：

- **Hologres 执行计划**：拿 `query_history.compiled_sql` 跑 `EXPLAIN ANALYZE`，重点看分区裁剪是否命中、有没有 shard 间数据重分布（`Redistribute Motion`）、统计信息是否过期、distribution key / clustering key 是否与常用过滤一致。
- **dbt 侧预聚合**：`SPU市占-全量模型` 这类月粒度的固定聚合适合做物化宽表，把每次导出的聚合计算换成读现成结果。代价是数据新鲜度与存储。
- **建模习惯**：避免 `sum(distinct ...)` / `count(distinct ...)`；时间过滤直接落在分区列上，不要写成 `WHERE date_trunc('month', col) >= ...`；图表不要挂用不到的维度。

## 6. 先量再定顺序

对出问题的那张图取三个数：

1. `query_history.warehouse_execution_time_ms`（数仓执行耗时）。
2. `results_updated_at - created_at`（从发起查询到结果文件写完）。
3. 导出任务从投递到完成的间隔，减去第 2 项，是导出转换的耗时。

更省事的办法：浏览器开发者工具里看 `GET /api/v2/projects/<p>/query/<uuid>` 响应中的 `initialQueryExecutionMs`，以及 `POST .../schedule-download` 到任务 `COMPLETED` 的时间差。

判定：

| 情况 | 先做哪项 |
|---|---|
| 数仓耗时占 70% 以上 | 第 5 节，应用层收益有限 |
| 单条查询亚秒级，但看板打开要十几秒 | 先看开了分页的 tile 有多少，命中第 1 项 |
| 首屏快、翻页越来越慢 | 第 3 项 |
| 导出慢、页面快 | 第 4 项或导出文档 |

第 2 项（连接复用）难以单独体现在某个数字上，可以在 `EXPLAIN ANALYZE` 之外单独测一次单条查询的建连耗时来判断值不值得做。

## 7. 不建议做的

- 为了让导出零查询，把首屏查询的上限拉到导出上限：等于每次打开看板都全表扫描。
- 单纯调大调度并发、任务超时、加 CPU 核数：对查询耗时没有作用。
- 在没有企业版授权时打开 `RESULTS_CACHE_ENABLED`：当前它只激活老 v1 缓存，写入是整份内存序列化，有 OOM 风险，对 v2 查询无效。
- 在应用层自造结果缓存：会和行级权限、用户属性冲突。

## 8. 排期参考

| 事项 | 归属 | 预估 | 前置 |
|---|---|---|---|
| 去掉可推导的 count 查询 | 前后端 | 1–2 人日 | 无 |
| 复用数据库连接 | 后端 | 2–3 人日 | 确认 Hologres 单实例连接上限 |
| 结果分页加行索引 | 后端 | 2–3 人日 | 先定是否长期开 gzip |
| 导出复用页面查询 | 前后端 | 1–2 人日 | 产品确认口径 |
| 数据层（预聚合 / 分区 / 建模） | 数据团队 | 按模型数量 | 先有 `EXPLAIN ANALYZE` 结果 |
