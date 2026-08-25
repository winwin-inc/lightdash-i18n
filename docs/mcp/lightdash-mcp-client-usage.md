# Lightdash MCP 客户端使用规范（后续推荐）

本文面向：**接入 MCP 的应用开发者、平台运维、AI 技能维护者**。  
说明推荐的标准调用方式，以及存量无 Session 客户端的兼容行为。

相关文档：

- 分析师用法：[lightdash-mcp-user-guide.md](./lightdash-mcp-user-guide.md)
- 查询工具快查：[lightdash-mcp-query-tools-quickref.md](./lightdash-mcp-query-tools-quickref.md)
- 包 README：[`packages/lightdash-mcp/README.md`](../../packages/lightdash-mcp/README.md)

---

## 1. 结论先看

| 场景 | 推荐做法 | 是否需要 `initialize` / `Mcp-Session-Id` |
|------|----------|------------------------------------------|
| Cursor / Claude Code / 标准 MCP 客户端 | **标准有状态 Session** | **需要**（客户端自动处理） |
| 自研 HTTP 客户端（新接入） | **标准有状态 Session** | **需要** |
| 存量业务（如 goldeneye）直接 `POST tools/call` | **兼容模式**（可继续用） | **不需要** |
| AI 写工具参数 | 每次查询显式传 `projectUuid` | 与 Session 无关 |

**原则：**

1. **新接入一律按标准 Session 协议实现。**
2. **存量无 Session 调用可继续工作**（服务端 per-owner 兼容通道），但不要作为新项目模板。
3. **`initialize` 是传输层握手，不是业务工具**；AI / 业务逻辑不要手工调 `initialize`。
4. **多副本环境不要依赖 `set_project` 的跨请求状态**；查询参数里带 `projectUuid`。

---

## 2. 唯一入口

服务只暴露：

- `GET /health` — 健康检查
- `ALL /mcp` — MCP Streamable HTTP

**错误示例（不要这样）：**

```text
GET  /mcp/tools/list
POST /mcp/tools/call
```

`tools/list`、`tools/call` 是 **JSON-RPC 的 method**，写在 `POST /mcp` 的 body 里，不是 URL 路径。

---

## 3. 标准用法（推荐）

适用于 Cursor、Claude Code、以及新写的自研客户端。

### 3.1 流程

```text
1. POST /mcp  method=initialize
   ← 响应头 Mcp-Session-Id: <uuid>

2. （可选）GET /mcp  + Header Mcp-Session-Id
   ← SSE 通道

3. POST /mcp  + Header Mcp-Session-Id
   body method=tools/list | tools/call | ...

4. （结束）DELETE /mcp + Header Mcp-Session-Id
```

### 3.2 Cursor / Claude `.mcp.json`

```json
{
  "mcpServers": {
    "lightdash": {
      "type": "http",
      "url": "http://mcp.example.com/mcp",
      "headers": {
        "x-api-key": "<your-pat>"
      }
    }
  }
}
```

说明：

- `type: "http"` 的宿主会自动完成 `initialize` 并保存 `Mcp-Session-Id`。
- 业务 / AI **只需调用工具**（如 `run_semantic_metric_query`），不要自己发 Session 头。

### 3.3 curl 冒烟（标准 Session）

```bash
# 1) initialize，保存响应头里的 Mcp-Session-Id
curl -i -X POST 'http://localhost:3333/mcp' \
  -H 'x-api-key: YOUR_PAT' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'

# 2) tools/list（必须带回 Session-Id）
curl -X POST 'http://localhost:3333/mcp' \
  -H 'x-api-key: YOUR_PAT' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Session-Id: <上一步的 session id>' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3) tools/call 示例
curl -X POST 'http://localhost:3333/mcp' \
  -H 'x-api-key: YOUR_PAT' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Session-Id: <session id>' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

### 3.4 自研客户端清单

新客户端应至少做到：

1. `POST initialize` 后读取响应头 `Mcp-Session-Id`
2. 后续所有 `/mcp` 请求回传该头
3. Session 过期 / 404 时重新 `initialize`（不要复用旧 id）
4. 工具参数里需要项目时传 `projectUuid`
5. 进程退出时可选 `DELETE /mcp` 释放 Session

---

## 4. 兼容用法（存量业务，可不改代码）

适用于已上线的 HTTP 客户端：直接 `POST tools/call`，不维护 Session。

### 4.1 行为

```text
POST /mcp
Header: x-api-key
Body:   { "method": "tools/call", ... }
```

- **无** `Mcp-Session-Id` 且 method 不是 `initialize` 时，服务端进入 **compat 模式**
- 按鉴权身份（PAT 哈希 / OAuth subject）复用该用户的兼容通道
- **不同用户互不共享**，避免回到早期全局单 transport 的串扰问题
- 日志中会出现 `compat=1`

### 4.2 约束

| 点 | 说明 |
|----|------|
| 兼容范围 | 仅 **POST JSON-RPC**；无 Session 的 GET/DELETE 仍 404 |
| 同 PAT | 同一 PAT 的多个无 Session 进程共享同一 compat 通道 |
| `set_project` | 存在于进程内存；多副本间不共享，**compat 路径不要依赖它** |
| 新项目 | 请改用第 3 节标准 Session，不要新写 compat 风格客户端 |

### 4.3 兼容 curl 示例

```bash
# 无需 initialize / Session-Id（存量风格）
curl -X POST 'http://localhost:3333/mcp' \
  -H 'x-api-key: YOUR_PAT' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_lightdash_version","arguments":{}}}'
```

---

## 5. 项目选择（AI 与业务都要遵守）

需要项目的工具（查询、空间、图表等）解析顺序：

1. **本次工具参数** `projectUuid`（最高优先）
2. 当前连接内的 `set_project`（单实例 / 有状态 Session 内有效）
3. 环境变量 `LIGHTDASH_PROJECT_UUID`

### 推荐

```text
每次 run_semantic_metric_query / run_metric_query 都显式传 projectUuid
```

### 不推荐

```text
先 set_project，再依赖后续请求“记得”项目
→ 多副本或 compat 路径下可能落到错误项目或报缺 projectUuid
```

`set_project` 仍可用于：交互式探索、单实例、同一 MCP Session 内的连续对话。  
自动化批处理、多副本、无 Session 兼容客户端：**请直接传 `projectUuid`。**

---

## 6. AI 应该知道什么 / 不应该知道什么

### AI 应该知道（写在工具描述 / analyst prompt）

- 工具名与参数
- `projectUuid` 优先级：参数 > `set_project` > 环境默认
- 批处理 / 多副本应显式传 `projectUuid`
- `set_project` 不保证跨副本共享

### AI 不应该关心（由 MCP 宿主 / HTTP 客户端处理）

- `initialize`
- `Mcp-Session-Id`
- compat transport
- sticky session

Cursor / Claude 连接好 MCP 后，AI 只调用工具即可。

---

## 7. 常见错误对照

| 现象 | 常见原因 | 处理 |
|------|----------|------|
| `404` 且 URL 是 `/mcp/tools/list` | 把 method 当成路径 | 改为 `POST /mcp`，body 写 `method` |
| `404 Session not found` + 有 Session 头 | Session 过期 / 被回收 / 错用户 | 重新 initialize；确认同一 PAT |
| `404` + GET 无 Session | 未带 `Mcp-Session-Id` | GET SSE 必须带 Session；或不要发 GET |
| 查询报缺 `projectUuid` | 未传参且未 set_project / 无环境默认 | 工具参数传 `projectUuid` |
| 偶发项目错乱 | 依赖跨请求 `set_project` | 每次查询显式传 `projectUuid` |
| `503 Too many active MCP sessions` | 并发 Session 触顶 | 增大 `LIGHTDASH_MCP_MAX_SESSIONS` 或缩短 TTL |

---

## 8. 多副本部署注意

| 路径 | 要求 |
|------|------|
| 标准 Session（有 `Mcp-Session-Id`） | 网关按 Session 做 **sticky**，否则后续请求可能 404 |
| 兼容模式（无 Session） | 不依赖 sticky；但 `set_project` / 会话态不跨副本 |
| 业务查询 | **始终显式 `projectUuid`**，与是否 sticky 无关 |

---

## 9. 后续接入建议（检查清单）

新系统接入 MCP 时：

- [ ] URL 使用 `…/mcp`，不要拼 `/tools/list`
- [ ] 使用标准 Session（initialize → 保存并回传 `Mcp-Session-Id`）
- [ ] 鉴权使用 `x-api-key`（或 OAuth Bearer）
- [ ] 查询类工具每次传 `projectUuid`
- [ ] 不把 `set_project` 当作跨服务 / 跨副本的全局状态
- [ ] 本地用第 3.3 节 curl 冒烟通过后再接业务

存量系统（已按无 Session 直调）：

- [ ] **可以不改代码**，依赖服务端 compat
- [ ] 确认查询参数已带 `projectUuid`（或服务端配置了默认项目）
- [ ] 有余力时再迁移到标准 Session

---

## 10. 版本说明

- **0.3.4**：全局无状态，无 Session 也能通，但多用户易冲突  
- **0.3.5+**：强制有状态 Session，无 Session 客户端会 404  
- **0.3.7+**：同 PAT 可多标准 Session 并存  
- **0.3.8+（compat）**：恢复无 Session POST 兼容，且按用户隔离；标准 Session 路径不变  

本文描述的是 **0.3.8+** 起的推荐用法。
