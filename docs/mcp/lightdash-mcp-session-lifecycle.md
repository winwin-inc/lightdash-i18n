# Lightdash MCP Session 生命周期与并发设计

本文面向维护 Lightdash MCP 服务的开发者，解释 Streamable HTTP Session 保存了什么、连接如何建立和关闭、此前 Session 堆积的原因，以及当前实现如何处理并发与回收。

客户端接入步骤、curl 示例和环境变量完整清单仍以[标准客户端用法](./lightdash-mcp-client-usage.md)为准；本文不重复接入操作。

> 版本范围：当前项目依赖 `@modelcontextprotocol/sdk ^1.17.5`，实现的是 **2025-03-26 至 2025-11-25 版本的 Session 型 Streamable HTTP**。MCP 在 **2026-07-28** 修订中已移除协议级 Session、独立 GET SSE 和 DELETE 终止流程。本文前 10 节描述当前 Lightdash MCP 的兼容实现，不应直接套用到 2026-07-28 无 Session 协议；版本差异见第 11 节。

## 1. 当前结论

当前实现已解决已知的主要问题：

- GET/SSE 只记录 SSE 连接数，不再被当作进行中的业务请求。
- SSE 长连接不会阻止业务空闲 TTL 或 LRU 回收。
- 进行中的 POST/DELETE 受 request lease 保护，不会被 TTL/LRU 中途淘汰。
- 长业务请求在开始和结束时刷新活动时间，避免请求刚结束就被判定过期。
- initialize、容量检查、TTL/LRU、主动关闭与进程退出使用统一的 Registry 生命周期。
- 关闭操作幂等，同时关闭 `McpServer` 与 `StreamableHTTPServerTransport`。

相关场景已有回归测试覆盖。这里的“已解决”指目前没有已知阻塞问题，不表示分布式部署、异常网络和未来 SDK 版本下绝对不存在边界情况；第 8 节列出了仍需遵守的约束。

## 2. Session、HTTP 请求和 SSE 不是同一概念

### 2.1 标准 Session

标准流程如下：

1. 客户端 `POST /mcp`，发送 `initialize`。
2. 服务端创建 pending entry，并在初始化成功后返回 `Mcp-Session-Id`。
3. 客户端后续 POST、GET、DELETE 都携带同一个 Session Id。
4. 客户端结束使用时发送 `DELETE /mcp`。

Session 是一段服务端内存状态，不等于某一条 TCP/HTTP 连接。一次 Session 可以先后处理多个 POST，也可以反复打开和关闭 GET/SSE。

### 2.2 POST

POST 是一次业务请求，例如 `tools/list` 或 `tools/call`。请求开始时增加 `activeRequestLeases`，结束时释放。

只要 request lease 大于 0，TTL 和 LRU 就不能回收该 entry，避免查询执行到一半时关闭其 server/transport。

### 2.3 GET/SSE

GET 会建立可长期保持的 SSE 响应流。它主要用于服务端向客户端发送异步消息：

- SSE 关闭不代表 Session 销毁。
- 同一 Session 可以关闭后重新建立 SSE。
- SSE 可能长期没有业务活动，因此不能作为 Session 存活依据。
- 当前只用 `activeSseLeases` 统计连接数，不用它阻止 TTL/LRU。

### 2.4 DELETE

DELETE 表示客户端主动终止标准 Session。SDK transport 处理 DELETE 后会触发 Session 关闭回调，Registry 从索引中摘除 entry，并幂等关闭 `McpServer` 和 transport。该 Session Id 随后失效。

部分宿主退出时不一定发送 DELETE，因此服务端仍必须提供 TTL/LRU 兜底。

## 3. 服务端实际保存什么

所有传输层 Session 数据都只保存在当前 Node.js 进程内，不写数据库。

### 3.1 Registry 索引

`mcpSessionRegistry.ts` 维护三类容器：

- `sessions: Map<sessionId, entry>`：已初始化的标准 Session。
- `compatByOwner: Map<ownerKey, entry>`：无 Session Id 的旧客户端兼容通道，每个 owner 一个。
- `pendingEntries: Set<entry>`：initialize 已占位、但尚未生成 Session Id 的 entry。

先把 pending 计入容量，再执行异步初始化，可以避免多个并发 initialize 都看到“还有一个空位”并共同越过上限。

### 3.2 每个 entry 的内容

每个 entry 主要包含：

- `ownerKey`：OAuth subject 或 PAT 哈希，用于身份隔离；不保存原始 PAT。
- `McpServer`：该 entry 对应的 MCP server 实例和工具注册。
- `StreamableHTTPServerTransport`：SDK 的 Streamable HTTP transport。
- `sessionId`、创建时间、最后业务活动时间。
- `pending | active | closed` 状态。
- request lease 与 SSE lease 计数。
- `closePromise`：保证并发关闭只执行一次。

标准 Session 通常是一 Session 一组 server/transport；compat 模式则是同一 owner 共享一组 server/transport。

### 3.3 其它内存状态

以下状态与 transport Session 不是同一个生命周期：

- Explore metadata cache 在多个 MCP server 之间共享，并按授权信息、项目和 explore 隔离。
- `set_project` 状态由独立的 `mcpSessionStore` 按 PAT 哈希保存，默认 7 天，不会随某个 transport Session 的 DELETE 立即删除。

因此，多窗口、多标准 Session、compat 或多副本环境不要依赖 `set_project` 作为强隔离状态；自动化查询应每次显式传 `projectUuid`。

## 4. 此前为何出现类似竞态的 Session 堆积

问题本质上不是 Node.js 多线程同时写 Map，而是异步生命周期分类错误。

旧接线把 GET/SSE 和 POST/DELETE 都计入同一个“活动请求”计数：

1. GET/SSE 调用 `handleRequest` 后会长期等待连接关闭。
2. 对应的 `finally` 长时间不会执行，活动计数一直大于 0。
3. TTL/LRU 看到“有请求执行中”，持续跳过这个 Session。
4. Cursor、Claude Code 等宿主重连时可能再次 initialize，退出时又未必发送 DELETE。
5. 新 Session 持续增加，旧 SSE Session 却永远不满足回收条件，最终推高 `activeSessions`。

它表现得像竞态，是因为 initialize、SSE 断线、POST、定时 prune 和 DELETE 会在不同异步时点交错；根因则是把“连接仍打开”和“业务仍执行”错误地当成同一件事。

## 5. 当前并发保护

### 5.1 生命周期 Mutex

Registry 使用异步 mutex 串行化会改变容量和索引的操作，包括：

- 创建 pending entry。
- owner/global 容量判断。
- TTL prune 与 LRU 淘汰。
- 主动关闭和进程退出关闭。

这样可以防止异步 `await` 期间另一个创建请求使用同一剩余容量。

SDK 的 Session 回调不再次获取该 mutex，避免关闭 transport 时回调反向等待同一把锁。实际资源关闭由 `closePromise` 保证幂等。

### 5.2 两类 Lease

| Lease | 来源 | 阻止 TTL/LRU | 刷新业务活动时间 |
|---|---|---:|---:|
| request lease | POST / DELETE | 是 | 是，开始和结束各刷新一次 |
| SSE lease | GET | 否 | 否 |

两类计数也分别通过 `/health` 的 `inFlightRequests` 与 `activeSseConnections` 暴露。

### 5.3 Owner 与全局容量

默认策略：

- 单 owner 软上限：10 个标准 Session。
- 单 owner 硬上限：20 个标准 Session。
- 全局上限：100 个 entry，包含标准、compat 和 pending。
- LRU 候选最小业务空闲：5 分钟。
- 业务空闲 TTL：15 分钟。
- 定时 prune：每 5 分钟执行一次。

超过 owner 软上限时，优先回收该 owner 的最旧空闲标准 Session；没有合适候选时允许短时增长到硬上限。达到 owner 或全局硬上限且无可回收候选时，新 initialize 返回 503。

compat entry 不占 owner 的标准 Session 软/硬额度，但仍占全局容量。

## 6. 开启与关闭流程

### 6.1 initialize

```text
鉴权并计算 ownerKey
  → 在 mutex 内创建 pending entry 并预占容量
  → 执行 owner/global TTL、LRU 和容量检查
  → 创建 transport 与 McpServer
  → server.connect(transport)
  → SDK 生成 Session Id
  → pending 转 active，写入 sessions Map
```

任一步失败都会 abort pending，并关闭已创建的资源，不保留容量占位。

### 6.2 业务 POST

```text
校验 Session Id 与 owner
  → 获取 request lease
  → transport.handleRequest
  → finally 释放 request lease并刷新活动时间
```

### 6.3 GET/SSE

```text
校验 Session Id 与 owner
  → 增加 SSE lease
  → transport.handleRequest 保持响应流
  → response close 时释放 SSE lease
```

SSE 在保持期间仍可能因业务空闲 TTL/LRU 被服务端关闭；客户端随后使用旧 Id 会得到 404，应重新 initialize。

### 6.4 DELETE、TTL、LRU 与 shutdown

这些入口最终都走统一释放逻辑：

1. 先从 `sessions`、`compatByOwner` 或 `pendingEntries` 摘除。
2. 将 entry 标记为 closed。
3. 幂等关闭 `McpServer`。
4. 幂等关闭 transport。
5. 记录关闭原因。

先从索引摘除可以让新请求立即看见 Session 已失效；`closePromise` 防止 DELETE、TTL、SDK 回调和 shutdown 重复释放同一资源。

## 7. 为什么不能只依赖 DELETE

协议鼓励客户端结束时发送 DELETE，但服务端不能假定它一定发生：

- 进程崩溃、电脑休眠或网络断开无法正常发送。
- 部分宿主只关闭 SSE 或直接退出。
- 网关超时可能先切断连接。
- 客户端重载配置时可能直接建立新 Session。

因此正确策略是：

- DELETE：正常路径，立即释放。
- TTL：异常退出后的最终回收。
- owner LRU：限制单个身份反复重连的影响。
- 全局容量：保护进程资源。

## 8. 当前已知边界

### 8.1 多副本需要粘滞

Registry 是进程内存。标准 Session 在 A 副本 initialize 后，后续请求若被转到 B 副本会得到 404。网关需按 `Mcp-Session-Id` 做 sticky routing，或者引入外部 Session 协调机制。

### 8.2 回收时间不是精确 15 分钟

TTL 默认 15 分钟，但 prune 默认每 5 分钟运行一次，所以无新容量检查时实际清理时间通常位于 TTL 到期后的一个 prune 周期内。

### 8.3 SSE 可能被服务端主动结束

SSE 不保护业务空闲 Session。客户端必须能处理 SSE 断开和旧 Session Id 返回 404，并重新 initialize。

### 8.4 `set_project` 不等同于 transport Session 状态

当前 `set_project` 按 PAT 哈希保存，而不是严格绑定 `Mcp-Session-Id`。同 PAT 的多个窗口可能互相影响项目默认值。查询显式传 `projectUuid` 才是稳定做法。

### 8.5 SDK 升级需回归关闭语义

当前关闭逻辑依赖 SDK 的 `onsessioninitialized`、`onsessionclosed`、`McpServer.close()` 和 transport close 行为。升级 `@modelcontextprotocol/sdk` 时应重点回归：

- DELETE 是否触发一次完整关闭。
- TTL/LRU 关闭活跃 SSE 时是否及时结束响应。
- 关闭回调是否仍不会与生命周期 mutex 形成环形等待。
- initialize 失败是否释放 pending 和 server/transport。

## 9. 排查指标

`GET /health` 返回：

- `activeSessions`：已初始化标准 Session 数，不是在线人数。
- `pendingSessions`：正在 initialize 的临时 entry。
- `compatSessions`：按 owner 复用的兼容 entry。
- `activeSseConnections`：当前 GET/SSE 连接数。
- `inFlightRequests`：当前 POST/DELETE 业务请求数。

常见判断：

- `activeSessions` 持续增长、`inFlightRequests` 接近 0：检查客户端是否重复 initialize，以及 TTL/LRU 日志是否正常。
- `activeSseConnections` 很高但 `inFlightRequests` 很低：可能只是大量长连接，不应阻止回收。
- `pendingSessions` 长时间不归零：检查 initialize 卡住、SDK connect 失败或上游请求异常。
- 持续出现 503：查看是 `scope=owner` 还是 `scope=global`，再判断单 owner 重连或全局容量问题。

## 10. 维护原则

修改 Session 生命周期时应保持：

1. 业务执行保护和连接统计分离。
2. 所有容量占位在异步创建前完成。
3. 所有关闭入口最终使用同一个幂等释放函数。
4. 身份校验失败统一表现为 Session 不可用，不能泄露其它 owner 的 Session。
5. 新增生命周期分支时，同时补充并发、TTL、LRU、DELETE、shutdown 和失败清理测试。

## 11. 协议版本与社区资料

### 11.1 当前实现对应的协议

当前代码使用 `Mcp-Session-Id`、GET SSE 和 DELETE，直接对应：

- [MCP 2025-03-26：Transports / Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP 2025-03-26：Lifecycle](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle)
- [MCP 2025-11-25：Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

2025-03-26 规范中的关键要求：

- 服务端可以在 initialize 响应中返回 `Mcp-Session-Id`。
- 客户端收到后，后续请求必须带回该 Id。
- 服务端可以随时终止 Session；旧 Id 后续返回 404。
- 客户端收到 Session 404 后必须重新 initialize。
- 客户端不再需要 Session 时应该发送 DELETE；但服务端可以不支持 DELETE。
- GET SSE 可由客户端或服务端随时关闭，断开本身不等于取消业务请求。

规范只定义可互操作行为，没有规定服务端必须采用多少分钟 TTL、每个 owner 允许多少 Session、如何 LRU、如何做多副本路由。这些属于服务实现策略。

### 11.2 最新协议已经变化

截至 2026-08，最新发布的协议资料：

- [MCP 2026-07-28：Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [MCP 2026-07-28：Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

2026-07-28 修订移除了：

- 协议级 `Mcp-Session-Id`。
- 独立 GET SSE endpoint。
- DELETE 终止 Session。
- `Last-Event-ID` 流恢复机制。

新协议倾向于每个 POST 请求独立处理；服务端如需跨调用状态，应使用显式、由服务端签发并作为普通参数传递的 handle，而不是依赖 transport Session。

这意味着当前实现不是“最新协议形态”，而是为了现有 Cursor、Claude Code 和其它 2025-era MCP 客户端保留的 Session 型实现。升级 SDK 或协议时不能只替换依赖版本，必须先确认客户端协商版本和兼容策略。

### 11.3 TypeScript SDK 资料

- [MCP TypeScript SDK v1 文档](https://ts.sdk.modelcontextprotocol.io/)
- [TypeScript SDK 仓库](https://github.com/modelcontextprotocol/typescript-sdk)
- [SDK Sessions、State 与 Scaling](https://ts.sdk.modelcontextprotocol.io/v2/serving/sessions-state-scaling.html)
- [v1 StreamableHTTPServerTransport 实现参考](https://github.com/modelcontextprotocol/typescript-sdk/blob/e74a358728991216391995e8daa5d0573614abc5/src/server/streamableHttp.ts)
- [SDK 1.17.5 变更对比](https://github.com/modelcontextprotocol/typescript-sdk/compare/1.13.0...1.17.5)

SDK 的 Session/Scaling 文档也明确说明：2025-era 的 stateful transport 需要应用自己维护 Session Id 到 transport 的 Map，并自行决定单机粘滞、共享存储或跨节点消息路由。

## 12. 为什么 `@modelcontextprotocol/sdk` 没有原生解决本次问题

SDK 解决的是单个 transport 的协议机制，应用负责整个服务的资源管理策略。两者边界不同。

### 12.1 SDK 已经做了什么

对当前 `StreamableHTTPServerTransport` 而言，SDK 负责：

- 生成并返回 Session Id。
- 校验请求携带的 Session Id。
- 处理 POST、GET/SSE 和 DELETE 的协议行为。
- 维护单个 transport 内的连接和消息状态。
- 暴露 `onsessioninitialized`、`onsessionclosed` 和 close 回调。
- 在客户端 transport 中保存并自动回传 Session Id。

这些能力让服务可以实现标准协议，但 SDK 不拥有整个 Express 服务，也不拥有所有 transport 的全局 Registry。

### 12.2 SDK无法替应用决定什么

SDK不能统一决定：

- 一个 PAT 或 OAuth subject 可以创建多少 Session。
- 哪个 Session 属于哪个业务 owner。
- 空闲多久应回收，GET/SSE 是否算业务活动。
- 长查询执行期间是否允许回收。
- 内存和连接接近上限时选择哪个 Session 做 LRU。
- 多副本使用 sticky routing、Redis、共享 EventStore 还是 pub/sub。
- 进程退出时还需要清理哪些业务资源。
- 宿主未发送 DELETE 时采用什么兜底策略。

这些都依赖应用的认证模型、负载、查询时长、部署拓扑和资源预算，SDK若强制一个默认值反而可能误杀正常请求或造成跨租户问题。

### 12.3 为什么 SDK 的关闭回调仍不够

`onsessionclosed` 只在 transport 知道 Session 已关闭时通知应用。它不能保证：

- 客户端崩溃前一定发送 DELETE。
- 网络断开等同于 Session 应被销毁。
- SSE 断开后客户端不会用同一个 Session Id 重连。
- 一个长期无消息的 SSE 应保留多久。

2025-era 协议明确允许 SSE 随时断开，也允许服务端随时终止 Session。因此，SDK不能仅凭 socket close 自动删除 Session；服务端仍需 TTL/LRU。

### 12.4 本次问题为什么出在应用接线层

SDK把 GET、POST、DELETE 都交给 `transport.handleRequest`，这是正确的协议抽象。旧代码又在这个调用外统一增加了业务 lease：

```text
所有 HTTP method
  → active request +1
  → await transport.handleRequest
  → finally active request -1
```

GET/SSE 的 `handleRequest` 可能等待很久，导致应用自己的业务 lease 长期不释放。SDK不知道这个计数的业务含义，也没有操作该计数，因此无法替应用修复。

当前接线改为：

```text
GET       → SSE lease，仅用于观测
POST/DELETE → request lease，用于保护正在执行的业务
```

所以这不是 SDK 漏掉了 DELETE 或 Session 校验，而是服务端在 SDK 外层把“长连接存活”和“业务请求执行”混成了一个资源保护条件。

### 12.5 是否应该改成无 Session

从最新协议方向看，未来应评估迁移到 2026-07-28 的无 Session handler。潜在收益：

- 不再维护 transport Session Map、TTL、owner LRU 和 sticky routing。
- 多副本更容易横向扩容。
- 客户端异常退出不再遗留协议 Session。

但当前不能直接删除 Session 逻辑：

- 现有客户端可能仍按 2025-era 协议发送 `Mcp-Session-Id`、GET 和 DELETE。
- 当前依赖 SDK v1.17.5，升级到新 handler 可能涉及包结构和 API 变化。
- compat、`set_project`、通知和 SSE 使用方式需要重新评估。
- 必须验证 Cursor、Claude Code、WorkBuddy 等目标宿主实际协商的协议版本。

建议把“迁移到 2026-07-28 无 Session 协议”作为独立升级任务，不与本次 Session 泄漏修复混合发布。
