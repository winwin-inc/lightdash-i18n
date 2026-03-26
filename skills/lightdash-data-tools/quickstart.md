# Lightdash MCP 提数 — 5 步上手

1. **环境变量**：`LIGHTDASH_SITE_URL`、`LIGHTDASH_API_KEY`；可选 `LIGHTDASH_DEFAULT_PROJECT_UUID`（省略后每步都要传 `projectUuid`）。
2. **接入 MCP**：按 `packages/lightdash-mcp/README.md` 在 Cursor / Claude Code 中配置 stdio 与上述 env。
3. **`lightdash_list_explores`**：`filtered: true` 拿到可用 explore。
4. **`lightdash_get_explore`**：`exploreId` 用第 3 步结果，读出真实 `fieldId`。
5. **`lightdash_run_metric_query`**：填 `exploreName`、`dimensions`、`metrics`，`filters` / `sorts` / `limit` 按需；先小 `limit` 验证再放大。

更多可复制 JSON 见 [examples.md](./examples.md)；进阶场景见 [examples-advanced.md](./examples-advanced.md)。
