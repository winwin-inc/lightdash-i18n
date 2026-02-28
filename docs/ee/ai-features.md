# Lightdash AI 功能文档

本文档汇总 Lightdash 目前已有的 AI 功能，包括使用场景、限制、配置方式及 API Key 策略。

> **注**：上游 Lightdash 要求 EE 许可证。本仓库改造后（参见 [ai-default-enabled-plan.md](./ai-default-enabled-plan.md)）无需 license 即可使用 AI。

---

## 一、AI 功能概览

| 功能 | 描述 | 所在模块 |
|------|------|----------|
| **AI Copilot / AI Agent** | 聊天式 AI 助手，支持自然语言探索数据、创建图表、查找看板与图表 | EE |
| **AI Dashboard Summary** | 看板智能摘要，基于图表数据生成文字总结 | EE |
| **AI Custom Viz** | 根据用户描述生成 Vega-Lite 自定义图表配置 | EE |
| **Slack AI** | Slack 集成中与 AI 交互，在频道/私信中提问获取数据洞察 | EE |
| **Ask AI Button** | 图表/探索界面的 AI 辅助入口 | EE |

---

## 二、使用场景

### 2.1 AI Copilot（AI Agent）

- **数据探索**：用自然语言描述需求，AI 自动查找相关 explore 和字段
- **创建图表**：生成柱状图、折线图、表格等可视化
- **创建看板**：一次生成多张图表的完整看板
- **查找现有内容**：搜索项目内已有看板和图表
- **字段值搜索**：查找维度字段中的具体取值（如产品名、地区等）
- **表格计算**：支持 Top N、占比、排名、移动平均等
- **上下文学习**：根据用户反馈改进后续回答
- **Slack 集成**：在 Slack 中与 AI 对话获取数据洞察

### 2.2 AI Dashboard Summary

- 基于看板中图表的实际数据与字段定义
- 生成文字摘要，帮助理解看板内容与趋势

### 2.3 AI Custom Viz

- 用户输入自然语言描述（如「按地区展示销售金额的饼图」）
- AI 生成 Vega-Lite 配置
- 用于自定义可视化图表

---

## 三、EE 功能与 License

### 3.1 企业版要求

所有上述 AI 功能均属于 **Enterprise Edition (EE)** 功能，需满足：

1. **有效 EE 许可证**：配置 `LIGHTDASH_LICENSE_KEY`
2. 许可证在启动时校验，无效则 EE 功能（含 AI）不会加载

### 3.2 功能开关

- **AI Copilot** 受 `CommercialFeatureFlags.AiCopilot` 控制
- 若 `AI_COPILOT_REQUIRES_FEATURE_FLAG=true`，还需 PostHog 中 `ai-copilot` feature flag 对组织/用户开启
- 若 `requiresFeatureFlag=false`，则只要 `AI_COPILOT_ENABLED=true` 即可

---

## 四、API Key 与 Provider 配置

### 4.1 使用自己的 Key（推荐）

**所有 AI 相关请求均使用你配置的 API Key，不走 Lightdash 的 Key 或业务。**

支持的 Provider 及对应环境变量：

| Provider | 环境变量 | 说明 |
|----------|----------|------|
| **OpenAI** | `OPENAI_API_KEY` | 默认 provider |
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude 模型 |
| **Azure OpenAI** | `AZURE_AI_API_KEY`、`AZURE_AI_ENDPOINT` 等 | 企业 Azure 部署 |
| **OpenRouter** | `OPENROUTER_API_KEY` | 多模型路由 |

只需配置**至少一个** provider 的 Key，并设置 `AI_DEFAULT_PROVIDER` 指定使用哪个（默认 `openai`）。

### 4.2 能否使用自己的 Key？

**可以，且必须使用自己的 Key。**  
Lightdash 不提供统一的 AI API Key，不经过 Lightdash Cloud 的 AI 业务。

### 4.3 请求路径与隐私

- **请求路径**：`前端 → Lightdash 自托管后端 → 各 LLM Provider API`
- **调用方式**：Lightdash 后端使用你配置的 Key **直接调用** OpenAI / Anthropic / Azure / OpenRouter
- **不走 Lightdash 业务**：不经过 Lightdash Cloud 或 Lightdash 的 AI 服务，数据仅在你自托管的 Lightdash 与所选 LLM 之间传递
- **自定义端点**：可通过 `OPENAI_BASE_URL` 将 OpenAI 请求指向自建代理或兼容 API，实现完全自控

### 4.4 关键环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AI_COPILOT_ENABLED` | 是否启用 AI Copilot | `false` |
| `AI_DEFAULT_PROVIDER` | 默认 LLM provider | `openai` |
| `OPENAI_API_KEY` | OpenAI API Key | - |
| `OPENAI_BASE_URL` | 自定义 OpenAI 兼容 API 地址 | - |
| `OPENAI_MODEL_NAME` | OpenAI 模型名 | `gpt-4.1-2025-04-14` |
| `ANTHROPIC_API_KEY` | Anthropic API Key | - |
| `ANTHROPIC_MODEL_NAME` | Anthropic 模型名 | `claude-sonnet-4-20250514` |
| `AZURE_AI_API_KEY` | Azure OpenAI Key | - |
| `AZURE_AI_ENDPOINT` | Azure OpenAI endpoint | - |
| `AZURE_AI_API_VERSION` | API 版本 | - |
| `AZURE_AI_DEPLOYMENT_NAME` | 部署名称 | - |
| `OPENROUTER_API_KEY` | OpenRouter API Key | - |
| `AI_COPILOT_MAX_QUERY_LIMIT` | 查询结果最大行数 | `1000` |
| `AI_COPILOT_REQUIRES_FEATURE_FLAG` | 是否依赖 PostHog feature flag | `false` |
| `AI_COPILOT_TELEMETRY_ENABLED` | 是否启用遥测 | `true` |
| `AI_COPILOT_DEBUG_LOGGING_ENABLED` | 是否启用调试日志 | `false` |
| `ASK_AI_BUTTON_ENABLED` | 是否显示 Ask AI 入口 | `true` |

---

## 五、限制

| 限制项 | 说明 |
|--------|------|
| **License** | 需有效 EE 许可证 |
| **查询行数** | 默认最多 1000 行（`AI_COPILOT_MAX_QUERY_LIMIT`） |
| **Provider 依赖** | 必须至少配置一个 provider 的 Key |
| **AiService（Dashboard Summary / Custom Viz）** | 当前仅支持 OpenAI（`OPENAI_API_KEY`），使用 LangChain ChatOpenAI |
| **AiAgentService（AI Copilot）** | 支持 OpenAI、Anthropic、Azure、OpenRouter，按 `defaultProvider` 选择 |

---

## 六、快速启用

### 6.1 自托管启用 AI Copilot

1. 设置 EE 许可证：
   ```
   LIGHTDASH_LICENSE_KEY=your-ee-license-key
   ```

2. 启用并配置至少一个 AI provider，例如 OpenAI：
   ```
   AI_COPILOT_ENABLED=true
   OPENAI_API_KEY=sk-your-openai-key
   AI_DEFAULT_PROVIDER=openai
   ```

3. 若使用自建或兼容 API：
   ```
   OPENAI_BASE_URL=https://your-proxy/v1
   OPENAI_API_KEY=your-proxy-key
   ```

### 6.2 使用 Anthropic

```
AI_COPILOT_ENABLED=true
AI_DEFAULT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-anthropic-key
```

### 6.3 使用 Azure OpenAI

```
AI_COPILOT_ENABLED=true
AI_DEFAULT_PROVIDER=azure
AZURE_AI_API_KEY=...
AZURE_AI_ENDPOINT=...
AZURE_AI_API_VERSION=...
AZURE_AI_DEPLOYMENT_NAME=...
```

---

## 七、总结

| 问题 | 答案 |
|------|------|
| 是否是 EE 功能？ | 是，需 EE 许可证 |
| 是否使用 Lightdash 的 Key？ | 否 |
| 能否使用自己的 Key？ | 可以，且必须使用自己的 Key |
| 是否经过 Lightdash 的 AI 业务？ | 否，请求由自托管 Lightdash 后端直接发往各 LLM Provider |
| 数据是否经 Lightdash 中转？ | 会经自托管 Lightdash 后端，但 AI 调用使用你配置的 Key 直连 Provider |
| 能否完全自控（自建代理）？ | 可以，通过 `OPENAI_BASE_URL` 等方式指向自建或兼容 API |
