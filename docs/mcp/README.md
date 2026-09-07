# Lightdash MCP 文档

| 文档 | 给谁 |
|------|------|
| [**外部接入指南**](./lightdash-mcp-external-guide.md) | **可单独转发给外部接入方**（含流程图） |
| [标准客户端用法](./lightdash-mcp-client-usage.md) | 内部完整规范（Session / compat / 运维细节） |
| [Session 生命周期与并发设计](./lightdash-mcp-session-lifecycle.md) | 开发维护（连接、内存状态、竞态与回收实现） |
| [用户使用说明](./lightdash-mcp-user-guide.md) | 分析师怎么提问 |
| [查询工具速查](./lightdash-mcp-query-tools-quickref.md) | semantic vs flat |
| [Docker 部署](./lightdash-mcp-docker-deploy.md) | 镜像与健康检查 |
| [包 README](../../packages/lightdash-mcp/README.md) | 环境变量、工具清单、构建 |
| [Skills](../lightdash-mcp-skills/README.md) | 对外挂技能 |

**0.4.x 要点：** 新接入用标准 Session；存量无 Session 走 compat；查询显式传 `projectUuid`；只有 `/health` 与 `/mcp`。
