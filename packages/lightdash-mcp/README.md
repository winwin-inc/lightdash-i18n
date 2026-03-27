# @lightdash/mcp

Lightdash 的 **MCP** 实现：通过 tools 调用 Lightdash REST API（v1 explores、v2 metric-query + 轮询）。

| 模式 | 用途 | 启动 |
|------|------|------|
| **stdio** | 本仓库 / IDE 子进程 | `node dist/index.js` 或 `pnpm -F @lightdash/mcp start` |
| **Streamable HTTP** | 独立部署，客户端只配 `url` + `headers` | `pnpm -F @lightdash/mcp start:http` → `http://<host>:<port>/mcp` |

与产品内 **Enterprise 托管 MCP** 解耦。

**完整说明（配置、Skills、测试）**：[docs/lightdash-mcp.md](../../docs/lightdash-mcp.md)

## 环境变量

| 变量 | 必填 |
|------|------|
| `LIGHTDASH_SITE_URL` | 是 |
| `LIGHTDASH_API_KEY` | 否（默认 PAT；HTTP 可用请求头或 tool `apiKey` 覆盖） |
| `LIGHTDASH_DEFAULT_PROJECT_UUID` | 否 |
| `LIGHTDASH_MAX_LIMIT` | 否 |
| `LIGHTDASH_MCP_HTTP_PORT` | 否（HTTP 默认 3333） |

## 构建

```bash
pnpm -F @lightdash/mcp build
```

## 运行

```bash
# stdio（需 .env 或导出变量）
pnpm -F @lightdash/mcp start

# HTTP（默认 0.0.0.0:3333/mcp）
pnpm -F @lightdash/mcp start:http
```

## Tools

- `lightdash_list_explores`（`apiKey?`）
- `lightdash_get_explore`（`apiKey?`）
- `lightdash_run_metric_query`（`apiKey?`）

## 可执行入口（package `bin`）

- `lightdash-mcp` → `dist/index.js`（stdio）
- `lightdash-mcp-http` → `dist/http.js`
