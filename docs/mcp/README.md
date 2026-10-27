# Lightdash MCP 文档

> **口径变更提示**：MCP 能力已合并进主站 `/api/v1/mcp`（统一 26 个工具、OAuth + PAT、无状态）。
> `packages/lightdash-mcp` 独立包进入**弃用期**，去留评估见 [独立包去留评估](./lightdash-mcp-retirement-evaluation.md)。
> 下表中标注「独立包」的文档描述的是旧部署形态；主站接入方式见 [主站 MCP 接入](./mcp-unified-backend-plan.md)。

| 文档 | 给谁 |
|------|------|
| [**独立包去留评估**](./lightdash-mcp-retirement-evaluation.md) | **决策者**：独立包继续维护 / 转薄壳 / 退役的对比与推荐路径 |
| [**外部接入指南**](./lightdash-mcp-external-guide.md) | **可单独转发给外部接入方**（含流程图） |
| [**MCP 服务上线流程**](./mcp-service-launch.md) | **上线负责人**：打 tag → GitHub Actions → Jenkins → 集群（四套部署目标），含配置清单、关联关系、权限模型、验收与回滚 |
| [标准客户端用法](./lightdash-mcp-client-usage.md) | 内部完整规范（Session / compat / 运维细节） |
| [Session 生命周期与并发设计](./lightdash-mcp-session-lifecycle.md) | 开发维护（连接、内存状态、竞态与回收实现） |
| [马上赢 X 平台 MCP 上手指南](./马上赢 X 平台 MCP 上手指南.md) | 连锁/品牌客户查品类宝与品类洞察（WorkBuddy 入驻底稿） |
| [用户使用说明](./lightdash-mcp-user-guide.md) | 分析师怎么提问 |
| [查询工具速查](./lightdash-mcp-query-tools-quickref.md) | semantic vs flat |
| [工具与权限对照](./mcp-tools-permissions.md) | 各工具最低项目角色 |
| [权限查询 get_my_access](./mcp-get-my-access.md) | 当前令牌的组织/项目能力与可查表 |
| [Docker 部署](./lightdash-mcp-docker-deploy.md) | 镜像与健康检查 |
| [包 README](../../packages/lightdash-mcp/README.md) | 环境变量、工具清单、构建 |
| [Skills](../../packages/lightdash-skills/README.md) | 对外挂技能 |
| [图表/看板内容即代码实施计划](../content-as-code-dev-plan.md) | CLI / MCP / Skill 三层改造计划（增改删审） |

**0.4.x 要点：** 新接入用标准 Session；存量无 Session 走 compat；查询显式传 `projectUuid`；只有 `/health` 与 `/mcp`。
