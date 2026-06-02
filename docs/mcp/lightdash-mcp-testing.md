# Lightdash MCP 测试文档

> 目标：覆盖「分析师优先」主路径（项目/内容/保存图表）与「高级兜底」路径（explore + metric query）。

---

## 测试环境

### 前置条件（HTTP：Streamable HTTP）

1. 构建：`pnpm -F @lightdash/mcp build`
2. 配置服务端 `.env`：

```env
LIGHTDASH_SITE_URL=https://your-lightdash.example.com
LIGHTDASH_API_KEY=<optional>
# LIGHTDASH_PROJECT_UUID=<可选；不配则本地先 set_project 再调需要项目的工具>
LIGHTDASH_MAX_LIMIT=<optional>
LIGHTDASH_MCP_HTTP_PORT=3333
```

3. 启动：`pnpm -F @lightdash/mcp start:http`
4. 客户端 `.mcp.json`：

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

5. 重载 MCP，确认看到当前注册的 MCP tools（以 `tools/list` 为准，共 19 个）

---

## 测试范围（当前工具）

### A. 业务优先工具（必须）

- `get_site_info`
- `list_projects`
- `find_content` / `find_charts` / `find_dashboards` / `find_spaces`
- `list_spaces`
- `get_saved_chart`
- `run_saved_chart`

### B. 高级工具（必须）

- `list_explores`
- `find_explores` / `find_fields`
- `run_semantic_metric_query`
- `run_metric_query`

---

## 测试用例

### 1) 工具可见性

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1.1 | 列出可用 MCP tools | 同时看到 A/B 两组工具 |

### 2) 业务主路径（分析师常用）

| 步骤 | 操作 | 预期 |
|------|------|------|
| 2.1 | `get_site_info` | 返回 `siteBaseUrl`，与 `LIGHTDASH_SITE_URL` 一致 |
| 2.2 | `list_projects` | 返回有权限项目列表 |
| 2.3 | `find_charts(searchQueries: [{ label: "销售" }])` | 返回图表列表，且每条含 `webUrl` |
| 2.4 | `list_spaces(projectUuid)` | 返回空间（文件夹）列表 |
| 2.5 | `get_saved_chart(chartUuid)` | 返回图表详情、参数信息，且含 `webUrl` |
| 2.6 | `run_saved_chart(chartUuid, parameters?, limit?)` | 返回 rows/columns，并包含 fields/warnings |

### 3) 高级兜底路径（自定义分析）

| 步骤 | 操作 | 预期 |
|------|------|------|
| 3.1 | `list_explores(filtered: true)` | 返回可用 explores |
| 3.2 | `find_fields(table, fieldSearchQueries)` | 返回目录检索结果（含 fieldId 线索）；或配合 `list_explores` 选定 explore 名 |
| 3.3 | `run_metric_query`（扁平最小 query） | 正常返回数据 |
| 3.3b | `run_semantic_metric_query`（brand_cls4 或 Explorer JSON） | 正常返回 CSV；改 filter values 可重试 |
| 3.4 | 扁平：`filters + sorts + limit`；语义：整段 `metricQuery` | 结果筛选与排序正确 |

最小 query 示例：

```json
{
  "exploreName": "<exploreName>",
  "dimensions": [],
  "metrics": [],
  "filters": {},
  "sorts": [],
  "limit": 10
}
```

### 4) 上限与轮询

| 步骤 | 操作 | 预期 |
|------|------|------|
| 4.1 | `run_metric_query(limit: 10000)` | 被限制到 `LIGHTDASH_MAX_LIMIT` |
| 4.2 | `run_saved_chart(limit: 10000)` | 同样被限制到 `LIGHTDASH_MAX_LIMIT` |
| 4.3 | 小 `maxPollAttempts` 跑大查询 | 超时报错包含 queryUuid |

### 5) 错误处理

| 步骤 | 操作 | 预期 |
|------|------|------|
| 5.1 | 错误 PAT | 401 |
| 5.2 | 无权限 PAT | 403 |
| 5.3 | 错误 `projectUuid` / `chartUuid` / `exploreId` | 明确 4xx 错误 |
| 5.4 | query 里使用错误 fieldId | 返回字段相关错误 |
| 5.5 | 无默认项目且未传 `projectUuid` | 返回明确提示 |

---

## Router 验证（建议）

用 `lightdash-insight-router` 验证“入口合一”：

1. 问「有哪些销售图表」-> 应优先走 `find_charts` / `find_content`
2. 问「跑营收趋势去年数据」-> 应走 `get_saved_chart` + `run_saved_chart`
3. 问「我要按维度临时分析」-> 应走 `list_explores` -> `run_semantic_metric_query`（有 Explorer JSON）或 `run_metric_query`（极简扁平）
4. 问「查表/SQL/明细」-> 应进入高级分支（若无 SQL tool，回退到 explore 路径并说明）

---

## 测试记录表

| 用例 | 状态 | 备注 |
|------|------|------|
| 1) 工具可见性 | - | |
| 2) 业务主路径 | - | |
| 3) 高级兜底路径 | - | |
| 4) 上限与轮询 | - | |
| 5) 错误处理 | - | |
| Router 入口合一验证 | - | |

---

## 调试命令

```bash
pnpm -F @lightdash/mcp build
pnpm -F @lightdash/mcp start:http
```

PowerShell 查看环境变量：`echo $env:LIGHTDASH_SITE_URL`

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-27 | 初版测试用例 |
| 2026-03-27 | 更新为分析师优先 + 高级兜底 + router 验证结构 |
| 2026-03-27 | 测试环境收敛为单一 HTTP 模式，移除 stdio 描述 |
