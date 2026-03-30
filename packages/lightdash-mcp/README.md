# @lightdash/mcp

Lightdash MCP 服务（适用于 Claude Code / Cursor）。

目标是让分析师优先通过「项目、空间、看板、已保存图表」快速取数，同时保留即席查询能力给进阶场景。

## 启动模式

仅保留 `streamable http`：

- 启动命令：`pnpm -F @lightdash/mcp start:http`
- 默认入口：`http://0.0.0.0:3333/mcp`

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `LIGHTDASH_SITE_URL` | 是 | Lightdash 站点地址 |
| `LIGHTDASH_API_KEY` | 否 | 默认 PAT（可被请求头或 tool 的 `apiKey` 覆盖） |
| `LIGHTDASH_DEFAULT_PROJECT_UUID` | 否 | 默认项目 UUID |
| `LIGHTDASH_MAX_LIMIT` | 否 | 查询 `limit` 上限 |
| `LIGHTDASH_MCP_HTTP_PORT` | 否 | HTTP 端口，默认 `3333` |
| `LIGHTDASH_WEB_DASHBOARD_PATH_TEMPLATE` | 否 | 看板路径模板，占位符 `{projectUuid}` `{uuid}` `{slug}`；默认 `/projects/{projectUuid}/dashboards/{uuid}/view` |
| `LIGHTDASH_WEB_CHART_PATH_TEMPLATE` | 否 | 图表路径模板；默认 `/projects/{projectUuid}/saved/{uuid}` |
| `LIGHTDASH_WEB_SPACE_PATH_TEMPLATE` | 否 | 空间路径模板；默认 `/projects/{projectUuid}/spaces/{uuid}` |

## 构建

```bash
pnpm -F @lightdash/mcp build
```

## 已提供工具（按推荐使用顺序）

业务优先：

- `lightdash_get_site_info`（返回 `siteBaseUrl`，无密钥）
- `lightdash_list_projects`
- `lightdash_search_content`（结果含每条 `webUrl` 与顶层 `siteBaseUrl`）
- `lightdash_list_spaces`
- `lightdash_get_saved_chart`（含 `webUrl`）
- `lightdash_run_saved_chart`

进阶（即席分析）：

- `lightdash_list_explores`
- `lightdash_get_explore`
- `lightdash_run_metric_query`

## Companion 包

- 技能包在 `packages/lightdash-skills`（给 Claude 的 SKILL 文档与示例）

## 参考文档

- 总文档：[`docs/lightdash-mcp.md`](../../docs/lightdash-mcp.md)
- 分析师向工具说明：[`docs/lightdash-mcp-user-oriented-tools.md`](../../docs/lightdash-mcp-user-oriented-tools.md)

## 常见 422 排障

- 422 通常是请求体校验失败，不是权限不足（权限问题更常见 401/403）。
- `lightdash_run_metric_query` 中 `parameters` 传对象 `{}`，不要传字符串 `"{}"`。
- `context` 仅支持 Lightdash 枚举值（如 `mcp`），不要传业务中文描述。
- 含 `lightdash.user.email` 过滤时，使用当前 PAT 对应邮箱；若用户主邮箱未验证，邮箱值可能为空。

## 可执行入口（bin）

- `lightdash-mcp-http` -> `dist/http.js`
