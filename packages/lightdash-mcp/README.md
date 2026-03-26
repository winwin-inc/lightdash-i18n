# @lightdash/mcp

独立 **stdio** MCP：通过环境变量 **PAT** 调用 Lightdash REST API（v1 explores、v2 metric-query + 轮询）。

与产品内 **Enterprise 托管 MCP** 解耦，适合本地 Claude Code / Cursor 配置 `.mcp.json`。

## 环境变量

| 变量 | 必填 |
|------|------|
| LIGHTDASH_SITE_URL | 是 |
| LIGHTDASH_API_KEY | 是 |
| LIGHTDASH_DEFAULT_PROJECT_UUID | 否（省略则每个 tool 传 projectUuid） |
| LIGHTDASH_MAX_LIMIT | 否（默认对 limit 封顶 5000） |

## 构建

```bash
pnpm -F @lightdash/mcp build
```

## Tools

- `lightdash_list_explores`
- `lightdash_get_explore`
- `lightdash_run_metric_query`

详见 `docs/lightdash-mcp-and-skills.md`。
