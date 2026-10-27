# 独立包（`packages/lightdash-mcp`）去留评估

> 状态：**待决策**（P7）
> 背景：主站已把 MCP 能力合并进 `/api/v1/mcp`（统一 26 个工具、OAuth + PAT、无状态）。
> 本文回答三个问题：独立包现在还有什么独有价值？继续维护 / 改薄壳 / 退役各要付出什么？推荐怎么做？

---

## 1. 结论摘要（TL;DR）

| 问题 | 结论 |
|---|---|
| 独立包还有独有能力吗？ | **没有工具层面的独有价值**。两侧工具集合完全一致（26 个），语义、参数、返回结构已对齐。剩下的差异全部是「运行形态」差异（session 头、鉴权方式、部署位置），不是能力差异。 |
| 继续维护的成本 | **高**。同一套工具逻辑有两份实现（独立包 ~11.3k 行 TS + 主站 MCP 模块），任何语义变更都要改两处并跑两套测试，已经出现漂移（独立包仍带 `sharedExploreCache`、内存 session、PAT-only）。 |
| 推荐方案 | **方案 C：分阶段退役**。先在文档与客户端配置上把主站 `/api/v1/mcp` 立为唯一推荐路径，独立包保持原样运行一个弃用窗口（建议 1–2 个发布周期），窗口结束后删除包、Docker 镜像工作流与旧文档。 |
| 为什么不做方案 B（薄壳） | 薄壳 = 一个持有 PAT 的**bearer token 中继**，为了「让老客户端 URL 不变」而新增一个需要托管长期凭据的进程，同时还要把主站的无状态语义重新包装成有状态 session。这是在用新风险换零功能收益。 |

---

## 2. 现状对比

| 维度 | 主站（`/api/v1/mcp`） | 独立包（`:port/mcp`） |
|---|---|---|
| 部署形态 | 复用主站进程与发布流水线 | 独立进程 + 独立 Docker 镜像 `winwin/lightdash-mcp`（`.github/workflows/build-docker-mcp.yml`，tag `mcp-v*`） |
| 工具集合 | 26 个（`McpToolName` 注册表） | 26 个（注册名与主站逐一 diff，零差异） |
| 鉴权 | 主站 OAuth（`mcp:read`/`mcp:write` scope 校验）+ PAT | 仅 PAT（`LIGHTDASH_API_KEY`），无 scope 概念 |
| 身份粒度 | **按用户**：OAuth token / PAT 绑定真实用户，CASL 逐用户鉴权 | **按 API Key**：所有客户端共享同一把 PAT，即同一个 Lightdash 身份 |
| 审计 | `mcp_tool_call` 埋点带 `user`/`organization`/`project`/`authType`/`durationMs`/`success` | 无统一埋点，仅 stdout 日志 |
| 会话 | **无状态**，不返回 `Mcp-Session-Id` | 有状态：`initialize` 返回 `Mcp-Session-Id`，内存 session registry（TTL / LRU / 容量上限） |
| 项目上下文 | PostgreSQL `mcp_context` 表，按 `user_uuid + organization_uuid` 隔离，**重启不丢** | 进程内存，按 PAT 哈希隔离，**重启即丢**（文档已提示多副本风险） |
| 权限过滤 | 直接调用主站 service，天然带 CASL / space 过滤 | 通过 REST 回主站，再自己解析 ability（`abilityFromRules` 等已迁入主站） |
| 错误语义 | 原生错误直接传播（`ForbiddenError`/`ParameterError` 等） | 经过 HTTP 往返，错误被压平成文本 |
| 可用性 | 跟随主站发布；主站不可用即不可用 | 独立进程可单独扩缩容，但重启丢 session |
| 运维面 | 一个进程 | 两个进程 + 一套镜像 + 一套环境变量 |

### 2.1 独立包当前的「独有价值」清点

逐条核对后，独立包相对主站**只剩运行形态差异**，没有能力差异：

- ✅ 独立进程可与主站分开扩缩容 —— 主站 MCP 本身是轻量 I/O 型负载，拆分收益有限。
- ✅ 标准 session 模式（`Mcp-Session-Id`）—— 这是**兼容性包袱而非能力**：主站刻意选择无状态，因为多副本/滚动发布下内存 session 必然丢（独立包文档里也把「会话丢了」列为已知问题）。
- ✅ PAT-only 鉴权 —— 主站 PAT 通道完全兼容，且主站还多了 OAuth。
- ✅ 独立包自带 Skills 分发说明 —— 与 MCP 服务本身无关，迁到主站文档即可。

结论：独立包目前是**同一能力的第二个部署形态**，不是新能力。

---

## 3. 三个方案

### 方案 A：保持原样（两边继续并行维护）

| 项 | 评估 |
|---|---|
| 代码成本 | 0（不写新代码） |
| 长期成本 | **高**：26 个工具 × 2 份实现；语义变更要改两处；两套测试；独立包已明显落后（内存 session、`sharedExploreCache`、错误压平） |
| 部署复杂度 | 保持现状：两个进程 + 一套镜像 + 独立环境变量 |
| 存量客户端影响 | 无 |
| 风险 | ① 两边行为持续漂移，用户按 URL 不同拿到不同结果；② 独立包持有长期 PAT 且所有客户端共享同一身份，审计粒度差；③ 独立包是独立安全面，PAT 一旦泄漏影响全部客户端 |

**适用**：短期（弃用窗口内）默认沿用。

---

### 方案 B：转为主站代理薄壳

独立包保留 HTTP 外壳（路径 `/mcp`、session 头、错误码），内部改为转发到主站 `/api/v1/mcp`。

| 项 | 评估 |
|---|---|
| 代码成本 | **中高**：需要实现 session 头 → 主站无状态的映射；需要实现 PAT 透传与主站 OAuth 的换取；需要复刻主站的错误码语义 |
| 长期成本 | 中：工具逻辑只有一份，但壳自身要维护转发、重试、错误映射、版本协商 |
| 部署复杂度 | **上升**：多一跳网络、多一个需要持有 PAT 的进程 |
| 存量客户端影响 | 最小（URL 不变） |
| 风险 | ① **PAT 中继**：薄壳进程长期持有高价值 PAT，且所有客户端共享同一身份，泄漏面不变但链路变长；② **session 语义倒退**：主站无状态是刻意设计，薄壳把它重新包成有状态，等于把已知问题（重启丢 session）又请回来；③ 故障模式翻倍（薄壳 + 主站两处都可能挂） |

**不推荐**：付出凭据中继 + 状态语义倒退的代价，只为保住一个 URL。

---

### 方案 C：分阶段正式退役（推荐）

**阶段 1（本次发布）—— 双轨但主站为默认**
- 主站 `/api/v1/mcp` 在文档、Skills 包、客户端示例中成为**唯一推荐**接入方式。
- 独立包**代码与镜像保持原样**（不动存量客户端）。
- 文档明确标注独立包进入「弃用期」，并给出迁移说明。

**阶段 2（弃用窗口，1–2 个发布周期）**
- 观察独立包调用量（Docker 镜像访问日志 / 主站侧对比）确认无活跃依赖。
- 提供迁移映射表（见 §4），客户按指引改 URL 与鉴权。

**阶段 3（移除）**
- 删除 `packages/lightdash-mcp`、`.github/workflows/build-docker-mcp.yml`、独立包镜像。
- 归档 `docs/lightdash-mcp/` 与 `docs/mcp/lightdash-mcp-*.md`（历史文档转 Archive 并在顶部标注已废弃）。
- `packages/lightdash-skills` 与 `docs/mcp/mcp-unified-backend-plan.md` 保留并更新为「主站统一」口径。

| 项 | 评估 |
|---|---|
| 代码成本 | 阶段 1–2 为 0；阶段 3 为**删代码**（净减 ~11k 行 + 一个镜像工作流） |
| 长期成本 | **最低**：单一实现、单一鉴权模型、单一上下文存储 |
| 部署复杂度 | **下降**：去掉一个进程与一套镜像 |
| 存量客户端影响 | 阶段 1–2 无；阶段 3 需要客户端改 URL（见 §4 差异表） |
| 风险 | ① 遗漏长尾客户端（用访问量门槛控制）；② 严格 session 客户端切换失败（用兼容说明 + 验证清单控制） |

---

## 4. 存量客户端差异清单（迁移时必须核对）

| 差异点 | 独立包 | 主站 | 迁移影响 |
|---|---|---|---|
| 端点 URL | `http://<host>:<port>/mcp` | `https://<site>/api/v1/mcp` | 必须改 URL |
| 鉴权 | 请求头带 PAT（`Authorization: Bearer <PAT>` 或自定义头） | OAuth（`mcp:read`/`mcp:write`）或 PAT | PAT 可直接沿用；OAuth 需走 DCR + PKCE |
| `Mcp-Session-Id` | `initialize` 响应头返回，后续请求需回传 | **不返回**，也不需要 | 严格 session 的客户端需关闭 session 依赖；宽松客户端（多数）无感 |
| 缺 session 报错 | 404 `mcp_session_missing_header` / `mcp_session_not_found` | 不存在 | 迁移后该错误类型消失 |
| session 容量错误 | `mcp_session_capacity`（LRU/TTL/每 owner 上限） | 不存在 | 迁移后该错误类型消失 |
| 项目上下文 | 内存，按 PAT 隔离，重启丢失 | PG `mcp_context`，按 `user + org` 隔离，重启不丢 | 迁移后 `set_project` 更可靠；**多用户共享 PAT 场景下上下文按用户隔离**（行为更正确） |
| 项目解析顺序 | session 项目 → 环境变量 `LIGHTDASH_PROJECT_UUID` → 工具参数 | 工具参数 `projectUuid` → PG 当前项目 → 报错 | 主站更严格：没有上下文且没传 `projectUuid` 会直接报错 |
| 工具数量/语义 | 26 个 | 26 个，命名与返回结构已对齐 | 无差异 |
| 错误形态 | HTTP 往返后压平为文本 | 原生错误直接传播 | 错误文案更详细，客户端若按文本匹配需回归 |
| 分析埋点 | 无 | `mcp_tool_call`（含 user/org/project/authType/duration/success） | 主站可观测性更好 |

**迁移自查清单（给客户端方）**
1. URL 改为 `https://<site>/api/v1/mcp`。
2. 鉴权：先沿用 PAT（改动最小）；需要按用户隔离或接入 scope 时再切 OAuth。
3. 客户端若强制要求 `Mcp-Session-Id`，改为不依赖 session；或确认其允许 `initialize` 响应无该头。
4. 显式传 `projectUuid`（推荐），或调用 `set_project`（现在跨进程/跨副本可靠）。
5. 回归验证：`get_site_info`、`list_projects`、`set_project` → `list_explores` → `run_semantic_metric_query` → `find_content` → `run_saved_chart`。

---

## 5. 推荐路径与触发条件

**推荐：方案 C，分 3 个阶段执行。**

- 阶段 1 立即可做：文档与 Skills 口径切到主站；独立包不动。
- 阶段 2 触发条件（满足其一即进入阶段 3）：
  - 弃用窗口结束（建议 1–2 个发布周期）**且**独立包调用量连续一个周期为 0；
  - 或明确确认无外部客户端依赖（内部自用为主）。
- 阶段 3 执行：删包 + 删镜像工作流 + 归档旧文档 + 清理 `pnpm-workspace.yaml` / `tsconfig.json` 引用。

**明确不做方案 B**，除非出现「客户端 URL 无法修改」且「无法接受 OAuth/PAT 变更」的双重硬约束——即便如此，也应先评估「让独立包作为反向代理做 URL 映射 + 复用主站 OAuth」而不是透传 PAT。

---

## 6. 待确认项

1. 独立包当前是否还有**外部客户**在用？调用量数据从哪取（镜像访问日志 / 主站侧 `mcp_tool_call` 对比）？
2. 弃用窗口定多长（建议 1–2 个发布周期）？
3. 阶段 3 是否保留 `packages/lightdash-mcp` 的历史 tag 与镜像（建议保留最后一个可用 tag 至少 90 天）？
4. 文档归档位置：`docs/lightdash-mcp/` 迁 `docs/archive/` 还是原地加「已废弃」横幅？
