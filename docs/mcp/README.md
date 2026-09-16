# Lightdash MCP 文档

| 文档 | 给谁 |
|------|------|
| [**MCP v2 说明与使用（最新）**](./lightdash-mcp-v2.md) | **当前推荐交付文档**（接入 → 鉴权/项目 → 工具与查询 → 与 v1 差异 → 运维） |
| [**外部接入指南**](./lightdash-mcp-external-guide.md) | 可单独转发给外部接入（含流程图；内容偏 v1 Session，新接入请同时读 v2 文档） |
| [标准客户端用法](./lightdash-mcp-client-usage.md) | 内部完整规范（含 Session / compat；**v1**） |
| [Session 生命周期与并发设计](./lightdash-mcp-session-lifecycle.md) | 开发维护（**v1** Session 实现） |
| [用户使用说明](./lightdash-mcp-user-guide.md) | 分析师怎么提问 |
| [查询工具速查](./lightdash-mcp-query-tools-quickref.md) | semantic vs flat |
| [Docker 部署](./lightdash-mcp-docker-deploy.md) | 镜像与健康检查（Dockerfile 已指向 v2） |
| [v2 包 README](../../packages/lightdash-mcp-v2/README.md) | 包级摘要 |
| [v1 包 README](../../packages/lightdash-mcp/README.md) | v1 环境变量与 Session 工具 |
| [Skills](../lightdash-mcp-skills/README.md) | 对外挂技能 |

**域名**：线上 `mcp-x.brandct.com` / `mcp-lightdash.banmahui.cn`；预发 `mcp-x.pre.banmahui.cn` / `mcp-lightdash.pre.banmahui.cn`（详见 [v2 文档·§2 快速接入](./lightdash-mcp-v2.md#2-快速接入)）。`-x` = 马上赢X，`-lightdash` = 内部平台。

**v2 要点（2026-09-16）**：MCP 2026-07-28 [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)；sessionless + legacy:stateless；无 set_project；项目用 projectUuid 或 LIGHTDASH_PROJECT_UUID；查数分页 limit+offset（建议稳定 sorts）；打 mcp-v* tag 构建 @lightdash/mcp-v2 镜像。

**v1 要点**：标准 Session；存量无 Session 走 compat；可选 `set_project`。
