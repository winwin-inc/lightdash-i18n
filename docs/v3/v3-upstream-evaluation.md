# 上游 3.x 新功能评估（对齐水位 2.57.0 → 3.208.0）

> 状态：**草案**（2026-11-11 盘点；供下一轮上游对齐窗口排期决策）
>
> 背景与基线：本仓产品版本 2.7.x 为自编号（≠ 上游版本号）；上一轮迁移窗口为上游 **0.2513.0 → 2.57.0**（对照 commit `c2ac5d553a`，见 [`../v2/v2-upgrade-and-migration-guide.md`](../v2/v2-upgrade-and-migration-guide.md) 文首基线表）。本文评估该水位之后的上游增量，作为 `docs/v3/` 系列的评估底稿。

---

## 1. 结论先行：3.0 不是「大版本功能包」

上游用 semantic-release 自动发版，**3.0.0 是被唯一一个破坏性变更触发的跳版**：

- `feat(pre-aggregates)!: rebuild on compile only for new or changed definitions`（#31196）
- 行为变化：项目 compile 不再全量重建受管预聚合；只有「从未完成物化的定义」和「开了 `refresh.on_change: true` 且定义指纹变了」才在 compile 时重建，其余交给 cron 或手动刷新。**部署 `PRE_AGGREGATES_ENABLED=true` 的实例必须给每个预聚合配 `refresh.cron`**，否则升级后不再自动刷新。
- 2.631.7 → 3.0.0 之间仅 5 个提交。

真正的增量窗口是 **2.57.0（2026-08-29）→ 3.208.0（`358fbceb50`，2026-11-10）**：**4203 个提交、1147 个 feat**，约 2.5 个月，规模与上一轮 0.2513 → 2.57 窗口相当。

## 2. 新功能全景（按 feat scope 统计降序）

| 主题 | feat 数 | 内容要点 | 对本 fork 的价值 |
|---|---|---|---|
| **AI 全家桶** | ~350（ai 193 / ai-agent 50 / ai-agents 43 / agent-identity 51 / composer 12） | **Composer**：AI 生成多节点查询管线（semantic-layer 节点、自定义指标、viz config、失败节点保留、battle mode）；**AI Agents**：线程绑定 dashboard/chart、自定义 agent skills 全量开放（#30501）、Deep Research 转正去 flag（#31413、#31427）；**agent-identity**：agent 连接审批页（#30923）、BYOK 按项目配额（#30367）、Autopilot 发送前人员复核（#30908）；instance decisions / Jev key 体系 | 上游投入最大方向，但强绑定其云端 AI 计费（AI credits）与模型网关；除非接自研模型网关（豆包插件）另立项，否则整体暂缓 |
| **Live Sources / Semantic Layer** | 13 + 9 | 免落仓直连数据源：PostHog（OAuth #31760）、GA4（#31795）、Search Console（#31794）、Google Ads（#32253）、Meta Ads（#32255）、LinkedIn Ads（#32267）、YouTube Analytics（#32266）；查询下推源 API、限流与结果复用（#31761）、用量/延迟监控；新增 Semantic Layer 管理页（#32085） | ⭐ 高价值候选：Google/Meta 系国内无用，但**连接器框架**（能力声明 #32191、下推编译、稳定错误码 #32192）可复用到自有数据源 |
| **Dashboard Controls 重做** | 16 + 43 | filter 改「一句话式 pill + popover 编辑」（#31830、#31827）、参数控件进控制条（#31952）、控件顺序编排（#32277）、按 tile 选目标（#31832）、fit-to-screen（#31883）、编辑带浮动化（#31828） | ⭐ 高价值：与在研 `feat/tab-date-range-constraint` 同域，上游重构直接影响移植基线，**建议优先评估汇流点** |
| **Documents** | 41 | 全新内容类型：markdown + chart tags 嵌图表（#30408）、SQL 图表（#30744）、版本对比（#30440）、个人文档入 Space（#30549）、删除恢复（#29282）、validator 校验（#30617）、AI 可编辑 | ⭐ 中高价值：轻量图文报表、依赖面小（非 EE） |
| **Merge Queries** | 15 | **GA**（#31191）、>2 源 join（#31136）、join 字段推荐（#29400）、非加和指标 totals（#29510） | 基线已移植 `mergeQuery`，本窗口是收尾增强，小步跟进 |
| **Content as Code** | 8 | YAML 上传/下载、回写本地 dbt package（#31731）、Git 管理内容带 release 动作（#31909）、agent 知识文档随 YAML round-trip（#31697） | 中价值：基线已有 `contentAsCode`，属增强跟进；与本仓 CLI 主线（`../cli/content-as-code-dev-plan.md`）有交集 |
| **Review Requests** | 7 | 内容评审流：请求线程（#28695）、评审人 UI/设置（#28435）、通知（#28432）、相似内容推荐（#28436） | 中价值：组织协作场景 |
| **Learn / Learn Sandbox** | 26 | 产品内教程 + 沙箱工作台（文件树 / YAML 编辑器 / 引导式终端 #29200）、content-as-code 课程 | 低价值（官方云获客导向），可整域跳过 |
| **Chart Studio / Registry / 可视化底座** | 6 + 10 | Chart Studio 脱离 Data Apps flag 独立开放（#31307）；**新 `packages/visualization` headless chart engine 包**（#30272）：前端渲染走它，Slack / MCP / 导出共用 | 底座级变化：headless 引擎对导出/嵌入一致性有长期价值，但牵动全部图表渲染，独立专项 |
| **MCP** | 27 | 项目级访问限制（#31783）、`X-Lightdash-Agent` header pin（#31488）、composer session 节点复用（#31813）、custom chart type 渲染（#31183） | 中价值：自研 MCP 权限层刚对齐 v1，这些是增量，逐个对照 |
| **Embed** | 19 | 嵌入式 AI agent（只读 token #32105、写动作多 Space #31303）、看板服务端渲染 PDF/图片导出（#31240、#31788） | 维持上轮口径「Embed 暂缓」；服务端 PDF 导出子项可单独评估 |
| **Onboarding 重做** | 13 | 全新注册/组织 setup 流程、AI onboarding agent 扫描 live sources（#32072）、starter chart types | 低-中价值 |
| **User Groups 常开** | — | 3.179.0 移除 `user-groups-enabled` flag（#32201）+ SCIM 组扩展（#28065）+ Role Sets 组维度 UI（#27569） | 专题另见 [`./v3-user-groups-status.md`](./v3-user-groups-status.md)：主干本仓已有，开 flag 即用 |
| **其他值得记录** | — | 预聚合 fingerprint 体系（唯一破坏性变更，见 §1）；组织用户属性 as code（#29620）；service accounts 转license-only（#31476） | 逐项按需 |

## 3. 工具链差距（迁移前置）

| 项 | 本仓现状 | 上游 3.208 | 备注 |
|---|---|---|---|
| Node | ≥20.19 <23 | **≥24**（devEngines 24.22.1） | 需升运行时 |
| pnpm | 9.15.5 | **12.16.1** | 跨 3 个 major |
| TypeScript | 5.5.4 | **7.0.2**（frontend） | TS7 = Go 原生版，行为差异需试跑 |
| React / Mantine | 19.0 / v6 混 v8 | 19.3 / v8 | 小步 |
| E2E | Cypress | **Playwright**（#31766） | 与仓库既有 puppeteer 经验更近 |
| 基础镜像 | — | Debian 13（#29901） | 运维侧跟进 |
| 新增包 | — | `packages/visualization`（headless 图表引擎）、`packages/api-tests` | visualization 是前端渲染架构级变化 |

> 建议按 [`../v2/step0-toolchain-assessment.md`](../v2/step0-toolchain-assessment.md) 的做法，为 v3 窗口重做一轮底座试跑。

## 4. 优先级建议（衔接 v2 backlog §1.1 取舍口径）

| 档 | 项 | 理由 |
|---|---|---|
| **P0 候选** | Dashboard Controls 重做、Documents、Merge Queries GA 增强（小） | 前者与在研 tab 日期约束同域需先定汇流点；后两者依赖面小、产品价值直接 |
| **P1 候选** | Live Sources 连接器框架（取 PostHog/自定义 API 架构，不迁 Google 系）、User Groups 启用+对齐常开（见专题）、MCP 增量对照、content-as-code 增量（与本仓 CLI 主线合流评估） | 架构可复用 / 已有基线小步跟 |
| **暂缓** | AI 全家桶（除非自研模型网关另立项）、Learn、Embed（维持上轮）、headless `visualization`（独立专项）、SCIM / Role Sets（EE 口径） | 云绑定重或上轮已明确不进 |
| **前置工作** | Node 24 / pnpm 12 / TS7 底座试跑 | 跨 3 个 pnpm major，先摸底再动 |

上轮暂缓项复核：Slug 重命名、Date Zoom 增强、Role Sets 在本窗口内**无破坏性演进**，维持原判。

## 5. 建议下一步

1. 抬高基线：把 [`../v2/v2-upgrade-and-migration-guide.md`](../v2/v2-upgrade-and-migration-guide.md) 与 [`../v2/v2-changelog-high-value-backlog.md`](../v2/v2-changelog-high-value-backlog.md) 文首基线表更新为 `对齐水位 2.57.0 → 3.208.0（评估窗口）`，正式迁移另立 `feat/v3-upgrade` 线。
2. P0 两项（Dashboard Controls / Documents）各出一份移植可行性细评（依赖面 + 冲突面），再排批次。
3. 预聚合破坏性变更：若客户侧有开 `PRE_AGGREGATES_ENABLED`，升级前需出迁移说明。

## 6. 相关文档

- V3 目录索引：[`./README.md`](./README.md)
- 用户分组专题：[`./v3-user-groups-status.md`](./v3-user-groups-status.md)
- 上一轮迁移指南与 backlog：[`../v2/v2-upgrade-and-migration-guide.md`](../v2/v2-upgrade-and-migration-guide.md)、[`../v2/v2-changelog-high-value-backlog.md`](../v2/v2-changelog-high-value-backlog.md)
- 工具链评估样例：[`../v2/step0-toolchain-assessment.md`](../v2/step0-toolchain-assessment.md)
