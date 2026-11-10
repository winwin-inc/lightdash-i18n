# Lightdash MCP 文档

> **版本口径**：
> - **v2（正式版）** = 主站内置 MCP，入口 `https://<site>/api/v1/mcp` → [v2 接入指南](./mcp-v2-guide.md) **（新接入只看这篇）**
> - **v1（弃用）** = 独立包 `packages/lightdash-mcp`，入口 `http://<host>:<port>/mcp` → [独立包去留评估](./lightdash-mcp-retirement-evaluation.md)
>
> 下表中未标注的文档描述的是 v1 旧部署形态。

| 文档 | 给谁 |
|------|------|
| **[v2 接入指南（主站正式版）](./mcp-v2-guide.md)** | **新接入方 / 运维**：URL、OAuth + PAT、26 工具、无状态语义、v1→v2 迁移清单 |
| [**线上地址速查**](./mcp-endpoints.md) | **所有人**：预发/生产两套 MCP（内置 v2 + 独立包 v1）在两个站点的实际连接地址、认证方式与强制看板模式开关状态 |
| [**统一改造归档（含 P8 规划）**](./mcp-unified-backend-status.md) | **接手方**：已完成阶段与提交、当前代码状态、已定稿决策、P8「默认项目语义 + 四级兜底链」完整规划；含上线排障记录（§6） |
| [**独立包去留评估**](./lightdash-mcp-retirement-evaluation.md) | **决策者**：独立包继续维护 / 转薄壳 / 退役的对比与推荐路径 |
| [**外部接入指南**](./lightdash-mcp-external-guide.md) | **可单独转发给外部接入方**（含流程图） |
| [**内置 MCP 部署与验收（v2）**](./mcp-builtin-deploy.md) | **上线负责人**：主站内置 `/api/v1/mcp` 的预发/上线配置清单（`MCP_ENABLED`、PAT/OAuth 二选一）、curl 验收步骤、回滚 |
| [**MCP 独立包上线流程（v1）**](./mcp-standalone-launch.md) | **上线负责人**：v1 独立包 `packages/lightdash-mcp` 的打 tag → GitHub Actions → Jenkins → 集群流程（四套部署目标），含配置清单、关联关系、权限模型、验收与回滚 |
| [**强制看板模式 v2（已实施）**](./lightdash-mcp-dashboard-strict-mode.md) | **已实施**：外部部署所有查询工具一律必须解析出 `dashboardUuid`（与角色无关）；0 候选按后端 `associatedCount` 分流；无权限 / 未配置看板 / 多候选的返回契约 |
| [客户端接入（Claude Code / Cursor + Skills）](./client-setup.md) | **开发/分析师**：怎么连、怎么挂 Skills、工具分组、常见 401/422 |
| [架构与鉴权概览](./architecture.md) | 开发维护：为何自建、独立进程取舍、只依赖公开 REST + PAT |
| [标准客户端用法](./lightdash-mcp-client-usage.md) | 内部完整规范（Session / compat / 运维细节） |
| [Session 生命周期与并发设计](./lightdash-mcp-session-lifecycle.md) | 开发维护（连接、内存状态、竞态与回收实现） |
| [马上赢 X 平台 MCP 上手指南](./马上赢 X 平台 MCP 上手指南.md) | 连锁/品牌客户查品类宝与品类洞察（WorkBuddy 入驻底稿） |
| [用户使用说明](./lightdash-mcp-user-guide.md) | 分析师怎么提问 |
| [查询工具速查](./lightdash-mcp-query-tools-quickref.md) | semantic vs flat |
| [工具与权限对照](./mcp-tools-permissions.md) | 各工具最低项目角色 |
| [权限查询 get_my_access](./mcp-get-my-access.md) | 当前令牌的组织/项目能力与可查表 |
| [Docker 部署](./lightdash-mcp-docker-deploy.md) | 镜像与健康检查 |
| [看板上下文（dashboardSlug 透传）](./mcp-dashboard-context.md) | 开发维护：`sql_filter` 依赖 `dashboardSlug` 时如何带上 `dashboardUuid` |
| [包 README](../../packages/lightdash-mcp/README.md) | 环境变量、工具清单、构建 |
| [Skills](../../packages/lightdash-skills/README.md) | 对外挂技能 |
| [图表/看板内容即代码实施计划](../cli/content-as-code-dev-plan.md) | CLI / MCP / Skill 三层改造计划（增改删审） |

**0.4.x 要点：** 新接入用标准 Session；存量无 Session 走 compat；查询显式传 `projectUuid`；只有 `/health` 与 `/mcp`。

**强制看板模式（v2 已实施，开关默认关闭）：** 外部部署通过 `MCP_DASHBOARD_STRICT=true` 要求**所有**查询类工具在查数前解析出 `dashboardUuid`，拿不到就阻断（不按角色放行）；0 候选时用后端 `associatedCount` 区分“没配看板”与“没权限”。实现差异见文档 §15。详见 [强制看板模式](./lightdash-mcp-dashboard-strict-mode.md)。
