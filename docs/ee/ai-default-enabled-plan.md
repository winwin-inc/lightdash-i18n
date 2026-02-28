# AI 默认启用改造方案

移除 license 及校验逻辑，保留 AI 与嵌入看板，废弃不需要的 EE 能力。

---

## 一、目标

- **移除**：license key、Keygen 校验、所有 license 相关逻辑
- **保留**：AI 功能、**嵌入看板（Embed）**
- **废弃**：SCIM、Slack 商业集成、Service Account、Organization Warehouse Credentials 等

---

## 二、改造内容

### 2.1 移除

| 项 | 说明 |
|------|------|
| `LIGHTDASH_LICENSE_KEY` | 环境变量不再使用 |
| `LicenseClient` | `packages/backend/src/ee/clients/License/` 可删除或停用 |
| Keygen.sh 调用 | 不再请求 `api.keygen.sh` |
| `lightdashConfig.license` | 配置中不再依赖，或改为空实现 |
| license 分支逻辑 | `getEnterpriseAppArguments()` 内不再根据 license 分叉 |

### 2.2 废弃（不加载）

| 功能 | 对应 Service / 模块 |
|------|---------------------|
| SCIM | scimService |
| Slack 商业集成 | CommercialSlackIntegrationService, CommercialSlackClient, slackIntegrationService |
| Service Account | serviceAccountService, serviceAccountModel |
| Organization Warehouse Credentials | organizationWarehouseCredentialsService |
| Support / MCP 等 | 按需决定是否保留 |

### 2.3 保留（AI + Embed）

| 类型 | 具体 |
|------|------|
| Services | aiService, aiAgentService, aiAgentAdminService, aiOrganizationSettingsService, **embedService** |
| Models | aiAgentModel, aiOrganizationSettingsModel, dashboardSummaryModel, **embedModel** |
| FeatureFlag | CommercialFeatureFlagModel（ai-copilot flag） |
| Scheduler 任务 | `AI_AGENT_EVAL_RESULT`、Embed 相关（如 DOWNLOAD_ASYNC_QUERY_RESULTS 的 JWT 路径），不含 `SLACK_AI_PROMPT` |

---

## 三、改造步骤

### 3.1 重写 `getEnterpriseAppArguments()`

**文件**：`packages/backend/src/ee/index.ts`

- 删除 license key 判断
- 删除 LicenseClient 与 Keygen 校验
- 直接返回 AI + Embed 相关 providers，不再返回 SCIM、Slack、Service Account 等

### 3.2 精简 SchedulerWorker

- 注册 AI 评估任务 `AI_AGENT_EVAL_RESULT`
- 注册 Embed 相关任务（如 `DOWNLOAD_ASYNC_QUERY_RESULTS` 的 JWT 用户下载）
- 不注册 `SLACK_AI_PROMPT`
- 需传入 aiAgentService、embedService，可基于现有 `CommercialSchedulerWorker` 删减

### 3.3 调整 knexfile

- 移除 `hasEnterpriseLicense = !!licenseKey`
- 改为始终加载 EE migrations（AI、Embed 表均在其中），或按 `AI_COPILOT_ENABLED`、embed 配置等条件加载

### 3.4 清理 license 引用

- `parseConfig`：`license.licenseKey` 可保留类型但不再作为门控
- `knexfile`、`snowflakeController`、`UserModel`、`HealthService` 等：移除或简化对 license 的依赖

### 3.5 废弃功能处理

- **路由**：SCIM、Service Account 等 controller 对应的路由仍由 TSOA 注册，但无 provider 时调用会抛错；可选择移除相关 controller 或保留（调用即失败）
- **前端**：SCIM、Service Account 等入口可通过配置或路由隐藏

---

## 四、依赖梳理

### 4.1 AiAgentService 与 slackClient

**slackClient 的主要用途**（仅限 Slack AI 场景）：

| 用途 | 调用位置 | 说明 |
|------|----------|------|
| 更新进度 | `updateSlackResponseWithProgress` | 在 Slack 频道显示「🤖 Thinking...」等 |
| 发送回复 | `postMessage` | 将 AI 回复发到 Slack 频道/线程 |
| 删除消息 | `deleteMessage` | 发送新回复前删除旧消息 |
| 上传文件 | `postFileToThread` | 将生成的图表图片上传到 Slack 线程 |
| 用户信息 | `getUserInfo` | `listAgentThreads` 中为来自 Slack 的 thread 展示 Slack 用户名 |

**触发条件**：上述调用均在 `prompt` 为 Slack 类型（`isSlackPrompt(prompt)`）时发生。Web 端 AI 对话**不经过** slackClient。

**改造方案下的处理**：

1. **不注册 `SLACK_AI_PROMPT`**：Scheduler 不执行 `replyToSlackPrompt`，Slack 相关 `postMessage`/`deleteMessage`/`updateMessage`/`postFileToThread` 不会被调用。
2. **传 base `SlackClient`**：AiAgentService 构造仍需 slackClient，传入 base 即可。
3. **风险点**：`listAgentThreads` 在存在「来自 Slack 的 thread」时会调用 `getUserInfo`，而 base `SlackClient` 在未配置 Slack（`isEnabled=false`）时会抛 `MissingConfigError`。
4. **可选方案**：
   - **A**：新增 `NoopSlackClient`，实现相同接口但所有方法 noop 或返回安全默认值，不抛错
   - **B**：修改 `listAgentThreads`，在 `!slackClient.isEnabled` 时跳过 `getUserInfo`，Slack thread 用 Lightdash 用户名展示
   - **C**：确保无 Slack thread（新部署或已清理历史数据），则不会走到 `getUserInfo`

### 4.2 AiService

- 依赖 `OpenAi` 客户端（`OPENAI_API_KEY`），与 slackClient 无关

---

## 五、配置与使用

```env
AI_COPILOT_ENABLED=true
OPENAI_API_KEY=sk-your-key
# 或 ANTHROPIC_API_KEY、AZURE_*、OPENROUTER_API_KEY 等
```

不再需要 `LIGHTDASH_LICENSE_KEY`。

---

## 六、工作量与优先级

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 1 | 删除 license 校验，重写 `getEnterpriseAppArguments()` 返回 AI + Embed | P0 |
| 2 | 精简 SchedulerWorker，保留 AI + Embed 任务 | P0 |
| 3 | knexfile 不再依赖 licenseKey | P0 |
| 4 | 清理各处的 license 引用 | P1 |
| 5 | slackClient 处理：NoopSlackClient 或 listAgentThreads 兼容 | P1 |
| 6 | 废弃功能的 controller/路由处理 | P2 |

---

## 七、风险与注意

1. **协议**：Source Available License 对生产使用有要求，本方案适用于自有 fork，需自行评估合规。
2. **SCIM、Service Account 等**：彻底废弃后，若未来需要再启用，需从版本历史恢复或重新实现。
