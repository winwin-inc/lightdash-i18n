# 数仓查询超时后上游没有取消（连接/查询残留）

状态：已实施（本期两个小改动）；配套运维动作与后续项见文末。
范围：`PostgresWarehouseClient`（Hologres / Postgres / Redshift）与 `packages/lightdash-mcp` 的轮询预算。
相关：[`query-performance-plan.md`](./query-performance-plan.md)、[`csv-export-performance.md`](./csv-export-performance.md)。

## 一、现象

看板查询与导出在数据库与网关都没有明显异常的情况下报超时，Hologres 侧同时能看到：

- `HGERR_code 53200 ... Total memory used by all existing queries exceeded memory limitation`
- 连接数吃紧（`remaining connection slots are reserved`、Lightdash 侧 `timeout exceeded when trying to connect`）
- **重启 Lightdash 服务后立刻恢复**，过一段时间（数小时）再次出现

最后一条是关键判据：配置项不会随时间累积，能“重启就好”的只可能是**进程持有的连接/查询**，或者**上游那批没有被取消的查询**。

## 二、根因

### 1. 客户端超时不等于上游取消

`packages/warehouses/src/warehouseClients/PostgresWarehouseClient.ts` 每条查询新建一个 `pg.Pool`，并设置：

```
connectionTimeoutMillis: 5000
query_timeout: credentials.timeoutSeconds ?? 5 分钟
```

`query_timeout` 是 **pg（客户端）** 机制：到点只是让本地 promise 报 `Query read timeout`，**不会给数仓发 cancel**；随后 `.finally` 调 `pool.end()`，而 pg 在仍有 activeQuery 时执行的是 `connection.stream.destroy()`——直接把 TCP 拆掉。

结果：Lightdash 已经报错、连接已断，**Hologres 上的那条 SQL 还在跑**，继续占着连接槽和实例查询内存（共享的一份 ~33 GB 池）。攒够就把整个实例拖垮，表现为“所有查询一起超时”，只能靠重启服务一次性断掉这些 socket。

同类问题还有一处：`AsyncQueryService.cancelAsyncQuery` 只把 `query_history.status` 改成 `CANCELLED`，**不通知数仓**，所以前端“取消/放弃”对上游无效。

### 2. MCP 的轮询预算用尽时，把“还在跑”报成“失败”

`packages/lightdash-mcp` 默认 `maxPollAttempts: 120 × pollIntervalMs: 500`（= 60 秒）。超时后直接 `throw`，并且**整个包没有任何 cancel 调用**。AI 客户端收到“失败”的常见反应是换个写法重试，于是同一条聚合在数仓上叠第二、第三条。UI 是 20 分钟放弃一次，MCP 是 60 秒一次，放大速度快 20 倍。

## 三、本期改动

| 改动 | 位置 | 作用 |
|---|---|---|
| 连接建立后 `SET statement_timeout TO <与 query_timeout 相同>` | `PostgresWarehouseClient.streamQuery` | 让数仓自己按同一个 deadline 取消语句，客户端断开后不再留残查询 |
| 设置失败只告警、不影响查询 | 同上（`try/catch` + `console.warn`） | 兼容拒绝该参数的 PG 兼容引擎/代理，避免引入新故障 |
| 超时值抽成 `getQueryTimeoutMillis()` | 同上 | 客户端与数仓两侧共用一个来源，不再出现“两边不一致” |
| 轮询预算用尽改抛 `QueryStillRunningError` | `lightdash-mcp/src/rest/queryStillRunning.ts` | 明确“查询仍在运行、不是失败”，并显式要求**不要重复提交**（附 queryUuid 与缩小范围的建议） |
| 错误格式化不再改写该错误 | `lightdash-mcp/src/mcp/tools/registerQueryTools.ts` | 否则会被拼成“请检查字段拼写”，等于鼓励重试 |

`statement_timeout` 的取值与客户端 `query_timeout` **完全一致**，因此不会让任何当前能成功的查询变成失败：任何超过该 deadline 的查询，今天在客户端侧本来就已经报错了。

## 四、配套运维动作（不在本仓库）

1. **数仓侧兜底**：`ALTER DATABASE <db> SET statement_timeout = '180s';`
   比逐个项目配置更可靠，也覆盖非 Lightdash 的会话。
2. **调度与 API 分进程**：`SCHEDULER_ENABLED=false` + 独立 worker（`yarn workspace backend scheduler`），导出不再与 API 抢同一个进程的内存与事件循环。
3. **资源上限按“堆 + off-heap”配**：`limits.memory` 与 `NODE_OPTIONS=--max-old-space-size` 的比例不要超过 ~2/3，导出链路的 Buffer / gzip / S3 SDK 都在 off-heap。
4. **`S3_REQUEST_TIMEOUT` 不要留 30 分钟**：上传卡住会被拖成“查询永远 PENDING”，对外表现同样是超时。

## 五、验证

改动后按下面四步验收：

1. 触发一次长查询（或把项目的 `timeoutSeconds` 调到 30 秒后查一个大表），确认错误文案变成数仓返回的 `canceling statement due to statement timeout`，而不是 `Query read timeout`。
2. 在同一时刻查 `pg_stat_activity`：不应留下 `active` 且 `client_addr` 为 Lightdash pod 的长跑查询。
3. MCP 触发一次超过轮询预算的查询，返回应为“查询仍在运行 / 不要重复提交”，而不是 `timed out after 120 polls`。
4. `SELECT status, count(*) FROM query_history GROUP BY 1` 里 `PENDING` 不再随时间单调增长。

## 六、仍然没做（后续）

| 事项 | 说明 |
|---|---|
| 真正的跨会话 cancel | 需要在 `streamQuery` 记录 backend pid（`client.processID`）并按 `queryHistoryUuid` 索引，`cancelAsyncQuery` 用另一条连接执行 `pg_cancel_backend`。本期用 `statement_timeout` 覆盖了超时场景，**主动取消**仍只改数据库状态 |
| MCP 同参数请求去重 | 按 `(projectUuid, explore, dimensions, metrics, filters, sorts, limit)` 做 in-flight 合并，重试不再产生第二条查询 |
| MCP 查询并发上限 | 目前 `inFlightRequests` 仅用于统计与 TTL 判断，不做限流 |
| 去掉可推导的 count 查询 | 见 [`query-performance-plan.md`](./query-performance-plan.md) |
