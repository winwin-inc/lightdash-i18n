# Lightdash MCP 测试文档

> 目标：在开始测试前梳理测试范围，确保覆盖核心功能与边界情况。

---

## 测试环境

### 前置条件（二选一）

#### 方式 A：stdio（本仓库内开发）

1. **构建**
   ```bash
   pnpm -F @lightdash/mcp build
   ```

2. **MCP 进程环境（`packages/lightdash-mcp/.env` 或客户端 `env`）**

   ```
   LIGHTDASH_SITE_URL=https://your-lightdash.example.com
   LIGHTDASH_API_KEY=<可选，默认 PAT；也可仅在 tool 里传 apiKey>
   LIGHTDASH_DEFAULT_PROJECT_UUID=<可选>
   LIGHTDASH_MAX_LIMIT=<可选>
   ```

3. **客户端（Claude Code / Cursor）**
   - 仓库根：复制 `.mcp.json.example` → `.mcp.json`，保留其中 `lightdash` stdio 段
   - `args` 须相对仓库根：`packages/lightdash-mcp/dist/index.js`

4. **重载 MCP**，确认出现 `lightdash_*` tools

#### 方式 B：独立 HTTP（Streamable HTTP）

适用于「客户端只配 URL + 头」、不启本地 `node …/index.js` 的场景。

1. **构建**
   ```bash
   pnpm -F @lightdash/mcp build
   ```

2. **服务端环境（`packages/lightdash-mcp/.env`）**

   ```
   LIGHTDASH_SITE_URL=https://your-lightdash.example.com
   LIGHTDASH_API_KEY=<可选：服务端默认 PAT；若客户端每次带 Authorization 则可省略>
   LIGHTDASH_MCP_HTTP_PORT=3333
   ```

3. **启动 HTTP 入口**
   ```bash
   pnpm -F @lightdash/mcp start:http
   ```
   默认监听 `http://0.0.0.0:3333/mcp`，健康检查 `GET /health`

4. **客户端 `.mcp.json`**（示例，`url` 与部署一致）

   ```json
   {
     "mcpServers": {
       "lightdash": {
         "type": "http",
         "url": "http://localhost:3333/mcp",
         "headers": {
           "Authorization": "ApiKey <your-pat>"
         }
       }
     }
   }
   ```

   亦可使用请求头 `x-lightdash-api-key`（与实现一致）。**注意**：`url` 是 **MCP HTTP 服务**地址，不是 Lightdash 站点首页；`LIGHTDASH_SITE_URL` 仅在 **MCP 服务端** `.env` 中配置。

5. **重载 MCP**，确认出现 `lightdash_*` tools

---

## 测试用例

### 1. 工具列表验证

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1.1 | 重启 Claude Code 后询问"列出可用的 MCP tools" | 看到 `lightdash_list_explores`、`lightdash_get_explore`、`lightdash_run_metric_query` |

---

### 2. lightdash_list_explores

| 步骤 | 操作 | 预期 |
|------|------|------|
| 2.1 | 调用 `lightdash_list_explores`（不传 projectUuid，使用默认） | 返回项目下 explores 列表 |
| 2.2 | 调用 `lightdash_list_explores(filtered: true)` | 仅返回已过滤的 explores |
| 2.3 | 调用 `lightdash_list_explores(filtered: false)` | 返回全部 explores |
| 2.4 | 调用 `lightdash_list_explores(projectUuid: "invalid-uuid")` | 返回 404 错误 |

**边界**：不传 projectUuid 且无默认时，应返回明确错误提示。

---

### 3. lightdash_get_explore

| 步骤 | 操作 | 预期 |
|------|------|------|
| 3.1 | 先 list explores 选一个 exploreId | 获取有效 exploreId |
| 3.2 | 调用 `lightdash_get_explore(exploreId: "<选中ID>")` | 返回 explore 定义，包含 dimensions、metrics、filters 等字段 |
| 3.3 | 验证返回包含 `fieldId`、`label`、`type` 等 | 字段元数据完整 |
| 3.4 | 调用 `lightdash_get_explore(exploreId: "invalid-id")` | 返回 404 错误 |

**验证点**：
- 返回的 JSON 应包含 `tables`、`dimensions`、`metrics`、`filters` 等
- 每个字段应有 `name`、`label`、`type`

---

### 4. lightdash_run_metric_query - 基础查询

| 步骤 | 操作 | 预期 |
|------|------|------|
| 4.1 | 从 get_explore 获取真实 `fieldId` | 确认可用字段 |
| 4.2 | 调用 `lightdash_run_metric_query` 仅传 `exploreName` | 返回默认 limit(500) 结果 |
| 4.3 | 调用指定 `dimensions` | 按维度分组返回 |
| 4.4 | 调用指定 `metrics` | 返回计算后的指标值 |
| 4.5 | 调用指定 `limit: 10` | 仅返回 10 条数据 |

**最小 query 示例**：
```json
{
  "query": {
    "exploreName": "<explore名>",
    "dimensions": [],
    "metrics": [],
    "filters": {},
    "sorts": [],
    "limit": 10
  }
}
```

---

### 5. lightdash_run_metric_query - 筛选与排序

| 步骤 | 操作 | 预期 |
|------|------|------|
| 5.1 | 添加 `filters`（与 get_explore 中 fieldId 一致） | 仅返回符合筛选条件的行 |
| 5.2 | 添加 `sorts` | 结果按指定字段排序 |
| 5.3 | 同时使用 filters + sorts + limit | 组合筛选、排序、限流正确 |

**filters 示例**：
```json
{
  "query": {
    "exploreName": "<explore名>",
    "filters": {
      "items": [
        {
          "id": "<fieldId>",
          "operator": "equals",
          "values": ["<value>"]
        }
      ]
    }
  }
}
```

---

### 6. lightdash_run_metric_query - 自定义维度

| 步骤 | 操作 | 预期 |
|------|------|------|
| 6.1 | 在 query 中添加 `customDimensions` | 返回包含自定义维度的结果 |
| 6.2 | 自定义维度 + 普通 dimensions 组合 | 两种维度都正确返回 |

---

### 7. 轮询与超时

| 步骤 | 操作 | 预期 |
|------|------|------|
| 7.1 | 使用默认 `maxPollAttempts` / `pollIntervalMs` | 大查询能正常轮询直至完成 |
| 7.2 | 设置小 `maxPollAttempts`（如 2）跑大查询 | 超时后返回明确错误（含 queryUuid） |
| 7.3 | 取消轮询参数跑小查询 | 快速返回结果 |

---

### 8. 错误处理

| 步骤 | 操作 | 预期 |
|------|------|------|
| 8.1 | 用错误 PAT 调用 | 返回 401 错误 |
| 8.2 | 用无项目权限的 PAT 调用 | 返回 403 错误 |
| 8.3 | 传不存在的 exploreName | 返回 400/500 错误 |
| 8.4 | query 中使用不存在的 fieldId | 返回字段相关错误 |
| 8.5 | 传无效 JSON 作为 query | 返回参数校验错误 |

---

### 9. limit 上限

| 步骤 | 操作 | 预期 |
|------|------|------|
| 9.1 | 传 `limit: 10000`（超过默认上限） | 被限制到 5000 或默认值 |
| 9.2 | 设置 `LIGHTDASH_MAX_LIMIT: 1000` 后传 `limit: 5000` | 被限制到 1000 |

---

### 10. 完整流程串联

| 步骤 | 操作 | 预期 |
|------|------|------|
| 10.1 | list explores → 选一个 → get explore | 拿到完整元数据 |
| 10.2 | 从返回抄 fieldId | 确认 fieldId 正确 |
| 10.3 | run query 用抄来的 fieldId | 成功返回数据 |

---

## 测试记录表

| 用例 | 状态 | 备注 |
|------|------|------|
| 1.1 工具列表 | - | |
| 2.1-2.4 list_explores | - | |
| 3.1-3.4 get_explore | - | |
| 4.1-4.5 基础 query | - | |
| 5.1-5.3 filters & sorts | - | |
| 6.1-6.2 customDimensions | - | |
| 7.1-7.3 轮询与超时 | - | |
| 8.1-8.5 错误处理 | - | |
| 9.1-9.2 limit 上限 | - | |
| 10.1-10.3 完整流程 | - | |
| HTTP：仅 header PAT、无服务端 LIGHTDASH_API_KEY | - | 方式 B 可选回归 |

---

## 调试命令

```bash
# 构建 MCP
pnpm -F @lightdash/mcp build

# stdio 入口（需在 packages/lightdash-mcp/.env 或环境中已导出变量）
node packages/lightdash-mcp/dist/index.js

# Streamable HTTP 入口（默认端口 3333，可用 LIGHTDASH_MCP_HTTP_PORT 覆盖）
pnpm -F @lightdash/mcp start:http
```

PowerShell 查看环境变量示例：`echo $env:LIGHTDASH_SITE_URL`

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-27 | 初版测试用例 |
| 2026-03-27 | 补充 stdio / HTTP 双路径、客户端示例、调试命令；修正测试记录表编号 |
| 2026-03-27 | 技能包模板：`skills/.mcp.json.example` 为 HTTP；仓库内 stdio 见根目录 `.mcp.json.example` |
