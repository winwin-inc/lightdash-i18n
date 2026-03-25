# Claude Code 增强方案

本文档整理如何增强 Claude Code 的能力，解决三个核心问题：
1. **代码索引**：快速理解项目代码（类似 Cursor 体验）
2. **工作流管理**：规格驱动开发，项目规划与执行
3. **记忆服务**（可选）：跨会话记住项目上下文

---

# 一、代码索引

## SocratiCode

企业级本地代码索引服务，零配置、自动索引、完全免费。

### 核心能力

- 本地 Docker 部署（Qdrant），数据不离开机器
- AST 智能代码分块
- 混合搜索（语义 + BM25）
- 多语言依赖图分析
- 文件变化自动更新
- 支持 40M+ 行代码
- **完全免费，无需 API Key**

### 性能

| 指标 | 效果 |
|------|------|
| 上下文使用 | 减少 61% |
| Tool 调用 | 减少 84% |
| 速度 | 比 grep 快 37 倍 |

### 前置要求

- **Docker Desktop** 必须运行（手动打开）
- Node.js >= 18
- 网络（首次需要下载 Docker 镜像和模型）

### 安装

```bash
# 确认 Docker 是否运行
docker ps

# 确认 Node.js 版本
node --version

# 添加 SocratiCode 市场源
claude plugin marketplace add giancarloerra/socraticode

# 安装插件
claude plugin install socraticode@socraticode
```

### 项目级 MCP 配置（替代方案）

> **重要**：如果你已经通过 plugin 方式安装了 SocratiCode，**不需要**在 `.mcp.json` 中配置。

```json
{
  "mcpServers": {
    "socraticode": {
      "command": "npx",
      "args": ["-y", "socraticode"]
    }
  }
}
```

### 首次使用

1. 打开 Docker Desktop
2. 在项目目录启动 Claude Code
3. 输入 "Index this codebase"
4. 等待索引完成（首次约 5 分钟）

### 常见问题

**Q: 会自动开 Docker 容器吗？**
A: **不会自动开 Docker**，需要手动打开 Docker Desktop。容器会自动启动。

**Q: 完全免费吗？**
A: **是的**，不需要任何 API Key，数据保存在本地。

**Q: macOS/Windows Docker 无法用 GPU 怎么办？**
A: 安装 [本地 Ollama](https://ollama.com/download) 自动加速：

```bash
ollama pull nomic-embed-text
```

**Q: Windows 上 MCP 连接失败怎么办？**
A: 全局安装 socraticode 后配置：

```bash
npm install -g socraticode
claude mcp add socraticode "socraticode"
```

---

# 二、工作流管理

## get-shit-done（规格驱动开发）

一个轻量但强大的元提示、上下文工程与规格驱动开发系统。

**解决的核心问题**：context rot — 随着 Claude 的上下文窗口被填满，输出质量逐步劣化。

### 核心能力

- **完整工作流**：讨论 → 研究 → 规划 → 执行 → 验证 → 发布
- **多代理编排**：并行研究、自动规划、wave 执行
- **原子 Git 提交**：每个任务独立提交，可精准 bisect
- **模块化设计**：支持 phase 插入、里程碑切换

### 工作流阶段

| 阶段 | 命令 | 作用 |
|------|------|------|
| 初始化 | `/gsd:new-project` | 提问 → 研究 → 需求 → 路线图 |
| 讨论 | `/gsd:discuss-phase N` | 收集实现决策 |
| 规划 | `/gsd:plan-phase N` | 研究 + 规划 + 验证 |
| 执行 | `/gsd:execute-phase N` | 并行 wave 执行计划 |
| 验证 | `/gsd:verify-work N` | 人工用户验收测试 |
| 发布 | `/gsd:ship N` | 创建 PR |
| 快速模式 | `/gsd:quick` | 临时任务，无需完整规划 |

### 安装

```bash
npx get-shit-done-cc@latest --claude --global
```

### 推荐配置

```bash
claude --dangerously-skip-permissions
```

### 已有代码库？

先运行 `/gsd:map-codebase`，它会并行分析技术栈、架构、约定和风险点。

### 与 SocratiCode 搭配

> **注意**：get-shit-done 的代码索引能力较弱（一次性分析报告），建议搭配 SocratiCode 使用。

| 维度 | get-shit-done | SocratiCode |
|------|---------------|-------------|
| **代码索引** | 一次性分析报告 | 持久化向量索引 |
| **查询方式** | 运行时生成报告 | 随时自然语言提问 |
| **增量更新** | 否 | 是 |

**推荐**：先单独用 SocratiCode 索引项目，再安装 get-shit-done。get-shit-done 内部会调用 SocratiCode，索引会被复用。

---

## Superpowers（TDD 驱动开发）

一个完整的软件开发生工作流系统，基于一组可组合的"skills"。

**核心理念**：不是一上来就写代码，而是先问清楚你要做什么，然后基于 TDD（测试驱动开发）执行。

### 核心能力

- **自动触发 Skills**：无需手动调用，Agent 自动识别场景
- **TDD 强制执行**：RED-GREEN-REFACTOR 循环
- **系统化调试**：4 阶段根因分析
- **Subagent 编排**：并行执行任务，双阶段审查
- **Git Worktree**：隔离开发分支

### 工作流阶段

| 阶段 | Skill | 说明 |
|------|-------|------|
| 头脑风暴 | `brainstorming` | Socratic 提问，明确需求 |
| 规划 | `writing-plans` | 拆分为 2-5 分钟的任务 |
| 执行 | `subagent-driven-development` | Subagent 执行 + 审查 |
| 测试 | `test-driven-development` | RED-GREEN-REFACTOR |
| 调试 | `systematic-debugging` | 4 阶段根因分析 |
| 完成 | `finishing-a-branch` | 合并/PR/清理 |

### 安装

```bash
/plugin install superpowers@claude-plugins-official
```

---

## 工作流系统对比

| 维度 | get-shit-done | Superpowers |
|------|---------------|-------------|
| **核心理念** | 规格驱动，wave 并行 | TDD 驱动，系统化 |
| **执行方式** | 按 wave 并行执行 | Subagent + 双阶段审查 |
| **测试** | 验证式 UAT | RED-GREEN-REFACTOR |
| **调试** | 自动诊断 | 4 阶段系统化调试 |
| **适用场景** | 快速功能开发 | 注重质量的开发 |
| **学习曲线** | 较低 | 较高 |

---

# 三、记忆服务（可选）

用于跨会话记住项目上下文（如架构、业务知识），需要手动写入记忆。

## mcp-memory-service（推荐）

功能最全的开源记忆服务，支持知识图谱、语义搜索、Remote MCP。

### 安装

```bash
pip install mcp-memory-service
MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http
```

### Claude Code 配置

```json
{
  "mcpServers": {
    "memory": {
      "command": "memory",
      "args": ["server"]
    }
  }
}
```

## 其他记忆服务

### memory-bank-mcp

受 Cline Memory Bank 启发，文件型记忆。

```bash
npx -y @allpepper/memory-bank-mcp
```

### memora

支持云同步（D1/S3/R2），知识图谱可视化。

```bash
pip install git+https://github.com/agentic-box/memora.git
```

---

# 四、推荐组合

## 敏捷开发推荐

**get-shit-done + SocratiCode**

对于敏捷开发模式，两者搭配使用效果最佳：

1. **先用 SocratiCode 理解代码**（索引一次，永久使用）
   - 语义搜索快速定位代码
   - 依赖图分析理解架构

2. **再用 get-shit-done 规划开发**
   - 快速功能规划（`/gsd:quick`）
   - Wave 并行执行，效率高
   - 原子提交，便于回滚

### 安装步骤

```bash
# 1. 安装 SocratiCode
claude plugin marketplace add giancarloerra/socraticode
claude plugin install socraticode@socraticode

# 2. 安装 get-shit-done
npx get-shit-done-cc@latest --claude --global
```

### 使用流程

```
1. cd 到项目目录
2. claude --dangerously-skip-permissions
3. 告诉 Claude："Index this codebase"（首次）
4. 使用 /gsd:quick 处理任务
```

---

## 质量优先推荐

**Superpowers + SocratiCode**

适合注重代码质量和测试的开发模式：

- 自动 TDD 流程（RED-GREEN-REFACTOR）
- 系统化调试（4 阶段根因分析）
- Subagent 双阶段审查

### 安装

```bash
/plugin install superpowers@claude-plugins-official
```

---

## 稳定推荐

**SocratiCode 独立使用**

如果你只需要快速理解代码，不需要复杂的工作流：
- SocratiCode 索引一次，永久使用
- 随时语义搜索定位代码
- 零配置，完全免费

---

| 需求 | 方案 |
|------|------|
| 快速代码理解 | **SocratiCode** |
| **敏捷开发** | **get-shit-done + SocratiCode** ✅ |
| **质量优先** | **Superpowers + SocratiCode** ✅ |
| + 记住项目架构/业务知识 | + mcp-memory-service |

---

# 五、相关链接

- [SocratiCode GitHub](https://github.com/giancarloerra/SocratiCode)
- [get-shit-done GitHub](https://github.com/gsd-build/get-shit-done)
- [Superpowers GitHub](https://github.com/obra/superpowers)
- [mcp-memory-service GitHub](https://github.com/doobidoo/mcp-memory-service)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Ollama 本地 embedding](https://ollama.com/download)
