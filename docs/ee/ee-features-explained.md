# EE 功能说明

本文档分别说明 EE（Enterprise Edition）中的主要功能：嵌入看板、SCIM、Service Account、Organization Warehouse Credentials、Slack 集成，以及 Slack 与微信/钉钉等 IM 的替换可能性。

---

## 一、嵌入看板（Embed）

### 是什么

将 Lightdash 的看板或图表**嵌入**到外部系统（如内部门户、客户 SaaS、官网等），通过 iframe 或 SDK 展示，访问者无需登录 Lightdash 即可查看。

### 能做什么

- **JWT 认证**：用 JWT 传递用户身份（external_id、可选的 name/email 等）和权限
- **按用户控制**：结合用户属性限制可看哪些看板、哪些筛选
- **多租户嵌入**：同一嵌入链接，不同 JWT 展示不同数据
- **异步下载**：嵌入用户也能下载 CSV 等（通过 JWT 身份）

### 典型场景

- 客户自助分析门户
- 内嵌到 CRM、ERP 等业务系统
- 公开/半公开数据看板

### 相关模块

- `EmbedService`、`EmbedModel`
- API：`/api/v1/embed/:projectUuid/*`
- 表：`embedding` 存储 project 与 secret 等配置

---

## 二、SCIM

### 是什么

**SCIM**（System for Cross-domain Identity Management）是一套标准协议，用于在身份提供商（IdP）与下游应用之间**自动同步用户与群组**。

### 能做什么

- **用户同步**：从 Okta、Azure AD、OneLogin 等 IdP 自动创建、更新、禁用 Lightdash 用户
- **群组同步**：将 IdP 中的群组映射到 Lightdash 的 group，实现基于群的权限
- **自动化**：减少人工创建用户、分配角色的工作

### 典型场景

- 企业使用 Okta/Azure AD 作为统一身份源
- 新员工入职时 IdP 自动创建 Lightdash 账号
- 离职或禁用时自动停用 Lightdash 访问

### 相关模块

- `ScimService`
- API：`/api/v1/scim/v2/Users`、`/api/v1/scim/v2/Groups` 等
- 认证：使用 **Service Account** 的 token 作为 SCIM API 的 Bearer token

---

## 三、Service Account

### 是什么

**Service Account** 是一种**机器账号**，用于程序/系统调用 Lightdash API，而不是真人登录。

### 能做什么

- **API 访问**：用 token 调用 Lightdash API，不依赖浏览器 session
- **权限细分**：通过 scopes 控制能力，例如：
  - `org:admin`：组织级管理
  - `org:edit`：组织内编辑
  - `org:read`：组织内只读
  - `scim:manage`：调用 SCIM API（用户/群组同步）
- **过期控制**：可设置 token 过期时间，支持轮换
- **审计**：记录创建人、最后使用时间等

### 典型场景

- SCIM 同步：IdP 调用 SCIM 接口时使用 Service Account token
- 自动化/CI：脚本或定时任务调用 API 创建看板、同步数据等
- 第三方系统集成：外部系统以机器身份访问 Lightdash

### 相关模块

- `ServiceAccountService`、`ServiceAccountModel`
- 表：`service_accounts`
- 与 SCIM 的关系：SCIM API 的认证依赖具有 `scim:manage` scope 的 Service Account

---

## 四、Organization Warehouse Credentials

### 是什么

**组织级数据仓库凭证**：在组织层面统一配置的数据源连接，供该组织下多个项目共享使用，而不需要每个项目单独配置。

### 能做什么

- **集中管理**：组织管理员配置一次，项目可直接选用
- **减少重复**：多项目共用同一套 BigQuery、Snowflake 等连接
- **权限控制**：由组织管理员控制谁可以使用这些凭证

### 典型场景

- 企业统一的数据平台，多个分析项目共享同一数据仓库
- 简化项目创建流程，新项目直接选择已有凭证

### 相关模块

- `OrganizationWarehouseCredentialsService`、`OrganizationWarehouseCredentialsModel`
- API：`/api/v1/org/warehouse-credentials`

---

## 五、Slack 集成

### 为何要有 Slack

Lightdash 来自海外（欧美）团队，Slack 在欧美企业是主流协同工具。集成 Slack 后，用户可以在**不离开 Slack 的情况下**与 AI Copilot 交互：

- 在频道或私信中 @机器人提问
- 在对话中获取图表、看板链接
- 利用 Slack 的 @提醒、线程讨论等协作能力

**典型场景**：分析/业务人员日常在 Slack 沟通，需要查数据时直接 @ Lightdash 机器人，无需切换到 Lightdash 网页。

### 与 AiAgentService 的关系

Slack 只是 **AI Copilot 的一种入口**，与 Web 端共用同一套 AiAgentService。不是专门给「Slack 运营人员」用的，而是给所有需要数据洞察的用户提供多一种访问方式。

### 能否换成微信、钉钉等

**可以**。从架构上看，Slack 与 AiAgentService 的交互可以抽象为「IM 客户端」接口：

| 能力 | Slack 实现 | 替换为微信/钉钉的要点 |
|------|------------|------------------------|
| 接收用户消息 | Slack Bolt 事件 | 对接微信/钉钉的 Webhook 或开放平台 API |
| 发送文本/图片 | `postMessage`、`postFileToThread` | 调用对应平台的发消息、上传素材接口 |
| 用户身份 | Slack user id | 建立 Slack user ↔ Lightdash user 的映射，微信/钉钉同理需要 openid 等映射 |
| 异步处理 | `SLACK_AI_PROMPT` scheduler 任务 | 可改为 `WECHAT_AI_PROMPT`、`DINGTALK_AI_PROMPT` 等 |

**改造思路**：

1. 定义 `ImClient` 接口（或抽象类），包含：`postMessage`、`updateMessage`、`deleteMessage`、`postFile`、`getUserInfo` 等
2. `SlackClient` 实现该接口；新增 `WechatClient`、`DingTalkClient` 等实现
3. AiAgentService 依赖 `ImClient` 而非直接依赖 `SlackClient`，按 prompt 来源（slack / wechat / dingtalk）选择对应 client

当前实现中 AiAgentService 强耦合 `SlackClient`，若要支持微信/钉钉，需做上述抽象与适配。

---

## 六、功能依赖关系

| 功能 | 依赖 | 说明 |
|------|------|------|
| **Embed** | embedService, embedModel | 独立，无其他 EE 依赖 |
| **Slack** | slackClient, AiAgentService, CommercialSlackService | 作为 AI Copilot 的 IM 入口，与 Web 共用 AiAgentService |
| **SCIM** | scimService, serviceAccountModel | 需要 Service Account 提供 SCIM API 的 token |
| **Service Account** | serviceAccountService, serviceAccountModel | 独立，可单独用于 API 调用 |
| **Organization Warehouse Credentials** | organizationWarehouseCredentialsService | 独立 |

---

## 七、与改造方案的关系

当前改造方案（详见 [ai-default-enabled-plan.md](./ai-default-enabled-plan.md)）：**保留** AI、Embed；**废弃** SCIM、Service Account、Organization Warehouse Credentials。
