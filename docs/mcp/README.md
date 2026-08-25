# Lightdash MCP 文档

| 文档 | 给谁 |
|------|------|
| [标准客户端用法](./lightdash-mcp-client-usage.md) | 接入 / Session / compat / goldeneye |
| [用户使用说明](./lightdash-mcp-user-guide.md) | 分析师怎么提问 |
| [查询工具速查](./lightdash-mcp-query-tools-quickref.md) | semantic vs flat |
| [Docker 部署](./lightdash-mcp-docker-deploy.md) | 镜像与健康检查 |
| [包 README](../../packages/lightdash-mcp/README.md) | 环境变量、工具清单、构建 |
| [Skills](../lightdash-mcp-skills/README.md) | 对外挂技能 |

**0.4.x 要点：** 新接入用标准 Session；存量无 Session 走 compat；查询显式传 `projectUuid`；只有 `/health` 与 `/mcp`。
