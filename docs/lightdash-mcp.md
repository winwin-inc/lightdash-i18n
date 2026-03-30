# Lightdash MCP 与 Skills 完整指南

本文档整合使用指南与设计说明，涵盖**配置使用**、**架构设计**与**实现规划**。

> **快速上手？** 直接看 [快速开始](#快速开始) 部分。
> **只想配置？** 看 [配置 MCP](#配置-mcp) 部分。
> **了解架构？** 看 [架构设计](#架构设计) 部分。

---

## 快速开始

### 三步提数流程

1. **`lightdash_list_explores`**（可选 `filtered: true`）→ 选定 explore
2. **`lightdash_get_explore`** → 从返回中抄 **真实 `fieldId`**
3. **`lightdash_run_metric_query`** → 填 `exploreName`、`dimensions`、`metrics`、`filters`、`sorts`、`limit` 等

**核心原则**：不要手写猜测字段名；先小 `limit` 验证再放大。

### 最快跑通示例（HTTP）

```bash
# 1. 构建
pnpm -F @lightdash/mcp build

# 2. 服务进程环境：packages/lightdash-mcp/.env（见下表）
cp packages/lightdash-mcp/.env.example packages/lightdash-mcp/.env

# 3. 启动 HTTP 服务
pnpm -F @lightdash/mcp start:http

# 4. 重载 MCP，确认出现 lightdash_* tools
```

**技能包 / 仅分发 Skills 的用户**：使用 **HTTP MCP**（独立进程 + 客户端只配 URL），模板见 [packages/lightdash-skills/.mcp.json.example](../packages/lightdash-skills/.mcp.json.example)。

---

## 配置 MCP

### 1. MCP 服务配置（`packages/lightdash-mcp/.env`）

进程级配置（仅 **HTTP 服务端**）：

| 变量 | 必填 | 说明 |
|------|------|------|
| `LIGHTDASH_SITE_URL` | 是 | Lightdash 站点根 URL，例如 `https://your-lightdash.example.com`（MCP 调 REST 用，**不是** MCP 自己的监听地址） |
| `LIGHTDASH_API_KEY` | 否 | 默认 PAT；也可由 HTTP 请求头、`tool` 参数 `apiKey` 覆盖 |
| `LIGHTDASH_DEFAULT_PROJECT_UUID` | 是 | 默认项目 UUID（服务启动必填） |
| `LIGHTDASH_MAX_LIMIT` | 否 | 单次 query 的 `limit` 封顶，默认 5000 |
| `LIGHTDASH_MCP_HTTP_PORT` | 否 | 仅 **HTTP 模式**，默认 `3333` |

**注意**：`.env` 勿提交（已在 `.gitignore`）。

### 2. 构建与入口

```bash
pnpm -F @lightdash/mcp build
```

| 模式 | 入口 | 说明 |
|------|------|------|
| **Streamable HTTP** | `dist/http.js` | `pnpm -F @lightdash/mcp start:http`；暴露 `POST/GET/DELETE /mcp`，`GET /health` |

### 3. 客户端配置（`.mcp.json`）

**PAT 小结**：HTTP 在客户端 `headers` 中传 `x-api-key: <PAT>`。与「`cb is not a function`」类 MCP SDK 注册问题无关。

放在**当前在 Claude Code / Cursor 中打开的项目根**（或客户端要求的路径）。模板：**技能包 / HTTP** [packages/lightdash-skills/.mcp.json.example](../packages/lightdash-skills/.mcp.json.example)。

#### 3a. HTTP（独立 MCP 服务）

先启动服务端：`pnpm -F @lightdash/mcp start:http`（或部署同一镜像/进程）。

```json
{
  "mcpServers": {
    "lightdash": {
      "type": "http",
      "url": "http://localhost:3333/mcp",
      "headers": {
        "x-api-key": "<your-pat>"
      }
    }
  }
}
```

- 默认使用请求头 `x-api-key: <pat>`。
- `url` 必须是 MCP 的 **`/mcp` 端点**，与 `LIGHTDASH_SITE_URL` 无关。

### 4. Claude Code / Cursor

- `.mcp.json` 置于项目根（或按官方说明的全局配置）
- 重载 MCP 后应看到 9 个工具（站点信息 + 项目/内容/空间/保存图表 + explore/metric query）

### 6. 验证

列出 MCP tools 或试调 `lightdash_list_explores`；若 401/403，检查 PAT 与项目权限；HTTP 模式另查服务端是否监听、`url` 是否带 `/mcp`。

---

## 启用 Skills

Skills 是 Markdown（含 frontmatter），告诉模型何时调哪个 tool。两者同时生效时，模型既会读到 Skill 里的流程，又能调用 MCP tools。

### 技能分工

| 技能 | 路径 | 用途 |
|------|------|------|
| 路由 | [packages/lightdash-skills/lightdash-insight-router/SKILL.md](../packages/lightdash-skills/lightdash-insight-router/SKILL.md) | 唯一入口，三分支路由 |
| Metric Query | [packages/lightdash-skills/lightdash-metric-query/SKILL.md](../packages/lightdash-skills/lightdash-metric-query/SKILL.md) | 高级 filters、customDimensions、timezone 等 |

## 可用 Tools

| Tool 名 | 作用 | 主要参数 |
|---------|------|----------|
| `lightdash_get_site_info` | 返回 `siteBaseUrl`（当前 MCP 连接的 Lightdash 根地址，无密钥） | `apiKey?` |
| `lightdash_list_projects` | 列出可访问项目 | `apiKey?` |
| `lightdash_search_content` | 搜索看板/图表/空间；返回含 `siteBaseUrl` 与每条 `webUrl` | `apiKey?`, `projectUuid`, `search?`, `contentTypes?`, `page?`, `pageSize?` |
| `lightdash_list_spaces` | 列出项目空间 | `apiKey?`, `projectUuid` |
| `lightdash_get_saved_chart` | 获取已保存图表详情；返回含 `webUrl` | `apiKey?`, `chartUuid` |
| `lightdash_run_saved_chart` | 运行已保存图表 | `apiKey?`, `projectUuid`, `chartUuid`, `parameters?`, `limit?` |
| `lightdash_list_explores` | 列出 explores | `apiKey?`, `projectUuid`, `filtered?` |
| `lightdash_get_explore` | 拉取 explore 定义与字段 | `apiKey?`, `projectUuid`, `exploreId` |
| `lightdash_run_metric_query` | 执行查询并等待结果 | `apiKey?`, `projectUuid?`, `exploreName`, `dimensions?`, `metrics?`, `filters?`, `sorts?`, `limit?`, `parameters?`, `context?`, `pageSize?`, `maxPollAttempts?`, `pollIntervalMs?` |

---

## 安全与排障

- **密钥**：`.env`、`.mcp.json` 的 `env`、HTTP 客户端的 `headers`、或 tool 参数 `apiKey`；不要粘贴进聊天、不要提交仓库
- **401/403**：检查 PAT 是否对该组织/项目可见
- **422（Unprocessable Entity）**：优先检查请求体是否通过校验。常见问题：`parameters` 传成字符串 `"{}"`、`context` 传业务中文而非枚举值、`filters` 类型错误
- **字段报错**：回到 `lightdash_get_explore` 核对 `fieldId`
- **超时 / 慢**：减小 `limit`、收窄维度、加筛选
- **`lightdash.user.email` 相关过滤**：使用当前 PAT 对应用户邮箱；若该用户主邮箱未验证，后端可能不会注入邮箱值
- **图表**：MCP 返回多为表格；需要图时可生成 Vega-Lite JSON

---

## 架构设计

### MCP 与 Skills 职责

| 组件 | 作用 |
|------|------|
| **MCP** | 向助手暴露可调用的 tools：列 explore、取字段、跑 metric query |
| **Skills** | 告诉模型何时调哪个 tool、不要猜 fieldId、常见错误怎么处理 |

```
User → Skills(指导) → MCP(调用API) → Lightdash API
```

### 设计目标

**目标**
- 列出项目下 explores（可选 filtered）
- 获取单个 explore 的字段元数据，供代理选 `fieldId`
- 提交异步 metric query，轮询至 `ready`，返回结果
- 请求体与后端 **完整 MetricQuery** 对齐

**非目标**
- 在 MCP 进程内复刻 Lightdash SQL 编译器
- 绕过 Lightdash 权限与组织隔离

### API 路径对照

| 能力 | 方法 | 路径 |
|------|------|------|
| 列出 explores | GET | `/api/v1/projects/{projectUuid}/explores?filtered=true\|false` |
| 单个 explore | GET | `/api/v1/projects/{projectUuid}/explores/{exploreId}` |
| 提交 metric query | POST | `/api/v2/projects/{projectUuid}/query/metric-query` |
| 查询结果 | GET | `/api/v2/projects/{projectUuid}/query/{queryUuid}?page=&pageSize=` |

**鉴权头**：`x-api-key: <PAT>`

---

## 实现细节

### 模块划分（`packages/lightdash-mcp/src/`）

1. **`lightdashRest.ts`**：`fetch`、explore / metric-query 与轮询
2. **`normalizeMetricQuery.ts`**：将不完整 query 规范化为安全默认值
3. **`createMcpServer.ts`**：注册 MCP tools（Zod 入参）
4. **`requestContext.ts`**：HTTP 模式下从请求头注入默认 PAT（`AsyncLocalStorage`）
5. **`http.ts`**：Streamable HTTP 入口（Express + `StreamableHTTPServerTransport`）
6. **`config.ts`**：从环境变量加载配置

### 健壮性规则

- **`limit` 上限**：默认封顶 5000（`LIGHTDASH_MAX_LIMIT` 可收紧）
- **轮询**：`maxPollAttempts` × `pollIntervalMs` 总超时上限
- **日志**：不向 stderr 打印完整 PAT

---

## 延伸阅读

| 文档 | 说明 |
|------|------|
| [packages/lightdash-mcp/README.md](../packages/lightdash-mcp/README.md) | 包级构建、入口与 tools |
| [docs/lightdash-mcp-testing.md](./lightdash-mcp-testing.md) | 测试用例与环境（HTTP） |
| [dashboard-custom-sql-dimension-filters-feasibility.md](./dashboard-custom-sql-dimension-filters-feasibility.md) | 自定义 SQL 维度与 filters 语义 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-27 | 收敛为 Streamable HTTP 单模式；更新客户端示例与模块说明；技能包模板迁移到 packages/lightdash-skills |
| 2026-03-27 | 修正配置说明：MCP 服务用 .env，客户端用 .mcp.json |
| 2026-03-27 | 合并使用指南与设计说明为单篇文档 |
| 2026-03-26 | 初版：使用指南独立成文 |
