# 图表 / 看板「内容即代码」开发闭环实施计划（平台能力 + 独立资产仓）

> 状态：**待开发**（本文档先于代码）。
> 分支：本仓库 `dev`（`git switch dev`）。
> 目标用户：分析师（日常建图、建看板、改内容）+ 交付/治理方（审查变更）。
> 涉及仓库：本仓 `lightdash-i18n`（fork）→ `packages/cli`、`packages/lightdash-mcp`、`packages/common`、`packages/backend`；**新增独立资产仓**（见 §5）。
> 上游对照：Lightdash 官方 `skills/developing-in-lightdash`（本仓 fork 未内置，移植时需按本仓能力裁剪）。

---

## 0. 范围

**在范围内**

- 某个 Lightdash 项目内，图表（saved chart）与看板（dashboard，含多 tabs）的**增 / 改 / 删 / 审**闭环。
- 本地 as-code 工作区 + CLI 上传/删除 + 服务端校验 + 变更 diff。
- MCP 写工具（让 agent 直接建/改/删内容）。
- 面向分析师的**内容开发 Skill + 模板 + 组装器**（独立立项，见 §5）。

**不在范围内**

- EE Data Apps、Chart Studio 自定义图表类型（chart types）、组织级资源（空间权限 / 用户 / 角色 / 定时任务）。
- 语义层（models / metrics / dimensions）建模方式改造——沿用现有 dbt + `lightdash deploy`。
- Vega-Lite 批量生成链路的完整实现（见 §7 P4，仅做可行性验证）。

---

## 1. 目标与验收标准（DoD）

### 1.1 能力矩阵（目标态）

| | 图表 chart | 看板 dashboard（含多 tabs） |
|---|---|---|
| **增** | ✅ as-code YAML → `lightdash upload`（新建走 `--force`） | ✅ 同上；`tabs[]` / `tiles[].tabSlug` / `filters` 均为 schema 一等公民 |
| **改** | ✅ 同上（slug 幂等覆盖） | ✅ 同上 |
| **删** | ⬜ 待补：CLI 无命令（REST 有 `DELETE /api/v1/saved/:chartUuid`） | ⬜ 待补：CLI 无命令（REST 有 `DELETE /api/v1/dashboards/:dashboardUuid`） |
| **审** | ⬜ 待补：`lint`（schema）已有，缺「上传后服务端语义校验」与「平台 vs 本地 diff」 | ⬜ 同上 |

### 1.2 验收标准

分析师在**自己的 dbt 仓库根目录**用以下命令完成「建图 → 建看板 → 改 → 删 → 审」，全程不点 UI：

```bash
lightdash download -d <slug> -p ./lightdash     # 拉基线
lightdash lint -p ./lightdash                   # 本地 schema 校验
lightdash upload -d <slug> --include-charts --validate -p ./lightdash   # 上传 + 服务端校验
lightdash diff -d <slug> -p ./lightdash         # 与平台现状对比
lightdash delete -d <slug>                      # 删除（带引用检查）
```

---

## 2. 现状盘点（已核实）

### 2.1 本仓已有的写通道

| 能力 | 位置 | 说明 |
|---|---|---|
| 拉取图表/看板/spaces 为 YAML | `packages/cli/src/handlers/download.ts` | `lightdash download`；看板会连带下载其关联图表；SQL 图表为 `*.sql.yml` |
| 上传（建/改） | 同上 `upsertResources` | `POST /api/v1/projects/{uuid}/code/charts/{slug}`、`.../code/dashboards/{slug}`；顺序：spaces → charts → sql charts → dashboards |
| schema 校验 | `packages/cli/src/handlers/lint.ts` | ajv + `packages/common/src/schemas/json/{chart,dashboard}-as-code-1.0.json` |
| 服务端语义校验 | `packages/cli/src/handlers/validate.ts` | `lightdash validate --only charts dashboards`；后端 `packages/backend/src/controllers/validationController.ts`（POST 建 job、GET 取结果） |
| 删除 REST 通道 | `packages/backend/src/routers/savedChartRouter.ts:80`、`dashboardRouter.ts:88` | 支持 API Key 鉴权，但 CLI 未封装 |

### 2.2 MCP 现状

- 工具共 ~29 个，**全部只读**；REST 客户端唯一的写请求是异步查询（`packages/lightdash-mcp/src/rest/endpoints.ts`）。
- OAuth scope 仅 `mcp:read`（`packages/lightdash-mcp/README.md`）。
- 可直接复用的读工具：`get_dashboard_code`（导出 as-code）、`get_dashboard_tiles`（回读 tabs/tiles）、`get_saved_chart(full=true)`、`find_fields` / `run_semantic_metric_query`。

### 2.3 as-code 数据结构（多 tab 的关键证据）

`packages/common/src/types/contentAsCode/dashboards.ts`：

```ts
DashboardAsCode = { tabs: Array<DashboardTab | DashboardTabAsCode>; tiles: DashboardTileAsCode[]; filters; parameters; spaceSlug; ... }
DashboardTabAsCode = { slug?; name; order; hidden?; filters? }        // tab 级过滤器
DashboardTileAsCode = { tileSlug; tabSlug?; properties: { chartSlug | chartName | title | content(markdown) | url | appSlug }; x/y/w/h }
```

- tabs 与 tile 的往返实现：`packages/backend/src/services/CoderService/CoderService.ts`（`getTabFiltersWithTileSlugs` / `getTabFiltersWithTileUuids`，约 378–470 行）。
- 跨图过滤器的 `tileTargets` 在 as-code 中用 **chartSlug**（不是 tileUuid）→ 可移植。
- 图表侧：`ChartAsCode` 含 `chartConfig` + `metricQuery`；`chartConfig.type: 'custom'` 时 `config.spec` 为 `Record<string, unknown>`，可承载 Vega-Lite spec（`packages/common/src/types/savedCharts.ts:392`）。

### 2.4 本 fork 相对上游缺失的内容创作能力

| 缺失 | 上游命令 | 影响 | 处置 |
|---|---|---|---|
| 上传后服务端校验 | `lightdash upload --validate` | 「审」不闭环 | **P0 补齐**（后端接口本仓已有） |
| 删除 | 无上游等价命令（上游 UI/Agent 删） | 「删」不闭环 | **P0 补齐**（REST 已有） |
| 本地跑 chart YAML | `lightdash run-chart -p chart.yml` | 批量造图时无法本地验证 | P4 可选（MCP 跑数 + 本地渲染替代） |
| 真实值查询 | `lightdash sql "…"` / `warehouse-catalog` | filter 值只能靠 MCP `search_field_values` | 用 MCP 替代，不补 CLI |
| virtual views / 组织级资源 | `--include-virtual-views` / `--organization` | 场景超出本期范围 | 不做 |
| Data Apps / chart types | `lightdash apps …` | EE，超出范围 | 不做 |

---

## 3. 方案选型：三条「写通道」

| 通道 | 载体 | 改造量 | 适用 |
|---|---|---|---|
| A. **CLI as-code**（主） | `lightdash/` 目录 + YAML | 只补 3 个 CLI 命令 | 批量、多 tab、需要版本化与评审 |
| B. **MCP 写工具**（辅） | MCP tool | 加 5 个 tool + 扩 scope | agent 直接建/改/删，单步交互 |
| C. **UI 粘贴**（兜底） | Vega-Lite spec JSON 粘到自定义图表编辑器 | 零改造 | 单图快速产出、平台不支持的类型 |

**决策**：A 为基座（评审与批量靠它），B 做自动化入口，C 保留为降级通道。**三者共用同一份 schema 事实**（`packages/common/src/schemas/json/*.json`），避免口径漂移。

---

## 4. 架构与工作流分层

```
┌─ 语义层 ──────────────────────────────────────────────┐
│ dbt + `lightdash deploy`（生产项目）                   │
│ `lightdash preview --name xxx`（临时 preview 项目，隔离）│
└───────────────────────────────────────────────────────┘
┌─ 内容层 ──────────────────────────────────────────────┐
│ Space 隔离：ld-dev（开发沙箱） / ld-mirror（只读基线）  │
│ as-code：lightdash/{charts,dashboards,spaces}/*.yml     │
│ 本地渲染：spec/<view>-<page>-<seq>/（5 件套 + preview）  │
└───────────────────────────────────────────────────────┘
┌─ 交互层 ──────────────────────────────────────────────┐
│ MCP（只读查数/核对字段 + P3 写工具）                    │
│ 独立资产仓 lightdash-content-kit（Skill/模板/组装器）     │
└───────────────────────────────────────────────────────┘
```

---

## 5. 落点评估：做在本仓，还是独立项目？

### 5.1 先纠正一个前提

**这次要做的不是 `packages/lightdash-skills` 的一部分。**

`packages/lightdash-skills` 的定位是「给 Claude Code 用的 **Lightdash 数据查询**技能包」：

- 单一入口 `lightdash-insight-router`，另两个子技能由 router 加载；
- 内容只讲**怎么问、工具顺序、排障**（`packages/lightdash-skills/CLAUDE.md` 范围约束：仅处理 Lightdash 数据任务、对外只暴露一个入口）；
- **不单独维护版本号**，版本随 `packages/lightdash-mcp` 的 `mcp-v*` tag 走（`packages/lightdash-skills/README.md`、`MAINTAINERS.md`）。

而本次产物是**内容开发链路**：as-code 编辑 → CLI `upload` / `delete` / `diff` → 审查发布。它

1. 依赖的是 **CLI**，不是 MCP 查询工具；
2. 读者是**分析师 / 交付方**，不是「问数」场景；
3. 发版节奏与 MCP 不同（CLI 随平台，Skill 随内容团队）。

→ **不塞进 `packages/lightdash-skills`**，独立立项（§5.4）。

### 5.2 产物三分法

| 产物 | 依赖 | 放哪 | 理由 |
|---|---|---|---|
| 平台能力：CLI `delete` / `upload --validate` / `diff` | 本仓 `packages/cli` | **本仓** | 代码就在这；与上游合并需尽量少动共享文件 |
| 平台能力：MCP 写工具 + `mcp:write` scope | 本仓 `packages/lightdash-mcp` | **本仓** | 涉及 OAuth scope 与工具注册，受 MCP 发版节奏约束 |
| 方法与资产：Skill、模板、蓝图、vega 组装器 | CLI + 本地文件 | **独立仓** | 跨客户/跨项目复用；不随 MCP 发版；不污染 fork |
| 业务内容：as-code YAML、spec、快照 | 平台 | **独立内容仓**（每客户/项目一个） | 版本化、评审、CI 发布 |

### 5.3 四个候选方案对比

| 维度 | A. 全在本仓 | **B. 平台在本仓 + 资产独立（推荐）** | C. 全外置（不动 fork） | D. 全外置 + 平台只留 REST |
|---|---|---|---|---|
| 平台能力落地 | 仓内直接改 | 仓内直接改 | 本仓零改动，靠脚本直调 REST | 仓内只补 REST 缺口 |
| 与上游合并冲突 | 中（新增 skill 目录 + CLI 改动） | **低**（新增目录少、CLI 改动集中） | 无 | 低 |
| 分发 | 跟本仓发版，跨客户要 fork | **资产仓独立发版；平台随仓** | 脚本自取，最轻 | 中 |
| 版本漂移风险 | 高（Skill 与 MCP 版本捆绑） | **中，靠契约文件 + schema 指纹兜底** | 中（靠文档） | 中 |
| 跨客户复用 | 差（改一个影响全部） | **好（content-kit 通用，差异下沉到客户仓）** | 中 | 中 |
| 评审链路 | 混在平台 PR | **资产仓独立 PR + 客户仓 PR 两级** | 轻但无约束 | 同 B |
| agent 自动化闭环 | 一般（无写工具） | **好（P3 补 MCP 写工具）** | 差（只能脚本） | 一般 |

**结论：选 B**（叠加 D 的轻量部分：CLI 增强是**本仓特权**，若不采纳则资产仓退回直调 REST，但核心工作流不变）。

### 5.4 独立资产仓形态（建议名 `lightdash-content-kit`）

```
lightdash-content-kit/
├── README.md                     # 分析师上手 + 落点说明（与本仓的关系）
├── platform-requirements.json    # 契约：minCliVersion / requiredMcpScopes / asCodeSchemaVersion+sha
├── .claude/skills/lightdash-content-ascode/
│   └── SKILL.md                  # 流程与避坑（上游 developing-in-lightdash 裁剪移植）
├── templates/                    # chart / dashboard as-code 模板
├── blueprints/                   # 看板蓝图（tabs / tiles / 栅格 / 过滤器）
├── vega/                          # spec 模板 + 组装器
│   ├── build_chart_yaml.py
│   └── build_dashboard_yaml.py
├── schema/                       # as-code schema 快照 + 指纹（由本仓导出）
└── scripts/{sync-schema.sh,validate.sh}
```

**客户内容仓（另一个仓，如 `lightdash-ascode-<客户>`）**只放：业务 as-code YAML、vega spec、客户专属 blueprint/术语表、`ci/publish.yml`（上传到 `ld-dev` → 人工评审 → 生产 Space）。

### 5.5 平台 ↔ 资产 的契约（防漂移）

1. **本仓导出 as-code schema**：新增 `pnpm export-as-code-schema`（导出 `packages/common/src/schemas/json/*.json` + 版本号 + sha256）。
2. **资产仓锁定指纹**：`platform-requirements.json` 记录 `asCodeSchemaSha256`、`minCliVersion`（含 `delete` / `upload --validate` / `diff`）、`requiredMcpScopes`。
3. **CI 校验**：资产仓 CI 跑 `scripts/sync-schema.sh --check`，指纹不一致即失败，提示升级。
4. **命令来源标注**：Skill 正文里每条命令标注「本仓 fork 特有 / 上游已有 / 需 ≥ 版本 x」，避免分析师在别处踩空。
5. **降级路径**：CLI 缺 `delete` / `--validate` 时，资产仓脚本回退到 REST（`curl` / 简单 Python），保证 Skill 不因平台版本卡死。

### 5.6 分发方式（待拍板，见 §9）

| 方式 | 成本 | 适用 |
|---|---|---|
| git 仓 + 拷贝/软链到分析师项目 `.claude/skills/` | 最低 | **推荐起步**；本仓无 skill 分发基建（`packages/lightdash-skills` 明确不设 package.json、不单独发版） |
| 内部 npm 包（`@<org>/lightdash-content-kit`） | 中 | 需版本化 + 多客户统一升级时 |
| 内网制品库 zip / 平台侧安装 | 中高 | 企业内网管控、需要审计时 |
| 塞进 MCP 服务端随 `mcp-v*` 发版 | 低但耦合高 | 不推荐：内容开发链路依赖 CLI 而非 MCP 查询工具 |

---

## 6. 命名约定

| 对象 | 名字 | 说明 |
|---|---|---|
| 独立资产仓 | `lightdash-content-kit` | Skill + 模板 + 组装器（跨客户复用） |
| 客户内容仓 | `lightdash-ascode-<客户>` | 业务 as-code YAML + vega spec + CI |
| 开发沙箱 Space | `ld-dev` | as-code `spaceSlug` 指向它 |
| 只读基线 Space | `ld-mirror` | download 快照存放 |
| 新 Skill | `.claude/skills/lightdash-content-ascode/SKILL.md` | **在资产仓内**，不在 `packages/lightdash-skills` |
| CLI 新命令 | `lightdash delete` / `lightdash upload --validate` / `lightdash diff` | 在本仓 `packages/cli` |

---

## 7. 阶段计划

### P0：CLI 补齐（删 / 审 / diff）——本仓 —— 目标 1～2 天

| # | 事项 | 改动文件 | 验收 |
|---|---|---|---|
| P0-1 | `lightdash upload --validate`：上传后触发服务端校验并打印结果 | `packages/cli/src/index.ts`、`packages/cli/src/handlers/download.ts`（复用 `validate.ts` 的 job 轮询） | 上传含失效 metric 的图表 → 命令非 0 退出并列出校验错误 |
| P0-2 | `lightdash delete -c/-d <slug>`：调用 DELETE API；删前检查引用（哪些看板的 tile 引用了该图表） | 新增 `packages/cli/src/handlers/delete.ts`；引用检查用 content v2 API 的 chartSlug 反查 | 删被引用的图表 → 明确拒绝并列出引用看板 |
| P0-3 | `lightdash diff -c/-d <slug>`：平台现状 vs 本地 YAML | 新增 `packages/cli/src/handlers/diff.ts`（download 到 tmp 后 `diff -u`） | 输出 unified diff，退出码 0/1 便于 CI |

**注意**

- P0-2 的引用检查是**软约束**（默认拒绝，`--force` 可跳过），避免误删生产图表。
- 与上游合并：新增 handler 文件为主，`index.ts` 只加命令注册，减少冲突面。
- P0-1/2/3 是资产仓 Skill 的**硬依赖**，若决定不采纳本仓改造，资产仓按 §5.5 降级到 REST。

### P1：契约与 schema 导出 ——本仓 —— 目标 0.5 天

- 根 `package.json` 增加 `export-as-code-schema`：输出 `schema/` 快照 + `asCodeSchemaSha256` + 版本号。
- 供资产仓 `scripts/sync-schema.sh` 消费。

### P2：独立资产仓立项（`lightdash-content-kit`）—— 目标 2～3 天

- 目录结构见 §5.4；`SKILL.md` 主体**蓝本**：上游 `skills/developing-in-lightdash/SKILL.md` + `resources/content-as-code-reference.md`（不要从零写，已沉淀大量坑）。
- **裁剪清单（必须按本仓能力删改，否则分析师会踩空）**：
  - 删除：`lightdash run-chart`、`lightdash sql`、`lightdash warehouse-catalog`、`lightdash apps …`、`--organization`、`--include-virtual-views`、`--chart-types`。
  - 替换：上游的 `lightdash upload --validate` 说法 → 标注「本仓 fork 特有，≥ 版本 x」；补上本仓 `lightdash validate --only charts dashboards`、`lightdash diagnostics`。
  - 保留并译为中文规则：Content Workflow（scratch 目录、默认不入库）、Chart & Dashboard Checklist、key 字母序、`contentType` 必填、filter 值先查真实值、`spaceSlug` 嵌套语法 `parent/child`、tile `title`/`chartName` 不会随图表改名自动更新、`metricQuery.dimensions` 与 chartConfig 维度必须一致。
- 同步修文档坏链（本仓）：`docs/mcp/README.md:16` 与 `docs/mcp/lightdash-mcp-user-guide.md:112` 原指向 `../lightdash-mcp-skills/README.md`（实际为 `packages/lightdash-skills/README.md`）——**已修**。

### P3：MCP 写工具 ——本仓 —— 目标 2～3 天

| 工具 | 方法/路径 | 关键参数 | 备注 |
|---|---|---|---|
| `upsert_chart_as_code` | `POST /api/v1/projects/{uuid}/code/charts/{slug}` | `projectUuid` `slug` `chart`（ChartAsCode） `skipSpaceCreate` | raw body 直发 |
| `upsert_dashboard_as_code` | `POST /api/v1/projects/{uuid}/code/dashboards/{slug}` | `projectUuid` `slug` `dashboard`（DashboardAsCode） | **必须 raw JSON**：`tabs[].filters` 会被 TSOA 剥掉，后端靠 `restoreDashboardTabFilters` 从 raw body 恢复 |
| `delete_chart` | `DELETE /api/v1/saved/{chartUuid}` | `chartUuid` `force` | 默认先查引用 |
| `delete_dashboard` | `DELETE /api/v1/dashboards/{dashboardUuid}` | `dashboardUuid` `force` | |
| `validate_content` | `POST /api/v1/projects/{uuid}/validate` + `GET …/validate?jobId=` | `validationTargets` | 轮询 job 结果 |

**前置条件**

- 扩 OAuth scope：新增 `mcp:write`（`packages/lightdash-mcp/README.md` 的 `OAUTH_REQUIRED_SCOPES`），否则只有 `mcp:read` 的令牌无法写。
- 权限模型：`delete` 需 `delete Chart` / `delete Dashboard` 能力；工具描述里写明最低角色。
- 单测：参考 `packages/lightdash-mcp/src/mcp/tools/registerContentTools.test.ts` 补 `registerContentWriteTools.test.ts`。

### P4（可选）：Vega-Lite 批量生成链路 —— 目标 3～5 天

- 输入：模板 spec（`{{x_field}}` 占位符）+ metric query JSON → Lightdash-ready spec（`data: {name:'values'}`、field 用 fieldId）。
- 关键约束（必须写进组装器与 Skill）：
  - spec 的 `data` 必须是 `{name:'values'}`；`encoding.field` 必须是**查询结果的 fieldId**（`packages/frontend/src/components/CustomVisualization/rewriteVegaSpecFieldLabels.ts`）。
  - `color.field` + `value` + `condition` 三件套在 Lightdash 端会被拒绝（静默不显示）；`scale.domain` 中的硬编码 domain 必须删。
  - 渲染校验发生在**浏览器端**（`packages/frontend/src/components/VisualizationConfigs/ChartConfigPanel/CustomVis/CustomVisConfig.tsx`），`lightdash lint` 拦不住 → 需本地用 vega-lite schema 预校验，或靠 MCP 回读 + 人工看。
- 组装器（放资产仓 `vega/`）：`build_chart_yaml.py`（spec.json + query.json → `charts/<slug>.yml`）、`build_dashboard_yaml.py`（蓝图 → `dashboards/<slug>.yml`，含 tabs/tiles/tabSlug/栅格）。

### P5（可选）：客户内容仓 + CI 发布

- 业务 as-code 入库 → PR 评审 → CI 先传 `ld-dev` → 自动 `lightdash upload --validate` + diff 快照 → 人工确认后同步生产 Space。

---

## 8. 风险与坑（实施时必须遵守）

**A. as-code 语义**

1. as-code 是 **slug 粒度整块覆盖**，不是 patch；本地 YAML 是唯一真相。
2. 任何人在 UI 上改了内容，若不重新 `download` 就 `upload`，会**反向覆盖 UI 的改动**。
3. `upload` 用 `downloadedAt` 与文件 mtime 比较（30s 阈值）决定是否跳过；改动必须真的落到磁盘（或用 `-c/-d <slug>` 强制指定、`--force` 全量推）。
4. 删除不存在于 YAML 的文件 **不等于删除远端内容**（上游明确列为常见错误）。
5. YAML 顶层缺 `contentType` 会导致类型识别依赖目录结构。

**B. 引用完整性**

6. `properties.chartSlug` 必须在 `charts/` 有同名文件，否则 tile 变孤儿。
7. `tiles[].tabSlug` 必须对应 `tabs[].slug`（多 tab 场景必查）。
8. 跨图过滤器 `tileTargets` 用 **chartSlug**；给图表改 slug 会打断过滤器。
9. 图表改名后，看板 tile 的 `title` 与 `chartName` 是**独立覆盖值**，不会自动更新 → 必须同步改所有引用它的看板。

**C. 口径与查询**

10. `metricQuery.dimensions` 中未在 chartConfig 使用的维度会改变 SQL 分组 → 数字错但有警告。
11. 字符串 filter 值大小写不匹配会**静默返回空**（需先查真实值）。
12. `tabs[].filters` 会被 TSOA 校验层剥掉（后端从 raw body 恢复）→ 自研写工具必须直发原始 JSON。

**D. 渲染与观感**

13. Vega-Lite spec 的渲染校验在浏览器端，`lint` 通过 ≠ 页面能显示。
14. 看板内还有颜色同步（`packages/frontend/src/components/CustomVisualization/vegaColorSync.ts`）与容器自适应，本地 preview 看不到 → 验收以线上为准。
15. `hidden: true` 的 tab 也会被导出/上传，勿误删。

**E. 跨仓治理**

16. 资产仓与本仓版本漂移 → 用 `platform-requirements.json` + schema 指纹 + CI 强制（§5.5）。
17. 本仓是 fork，CLI 改动要控制冲突面（新增文件优先，`index.ts` 只做注册）。
18. Skill 文案里出现本仓 fork 特有命令时，**必须标注**，否则跨客户复用会踩空。

---

## 9. 评审（review）流程

```bash
git diff lightdash/                # 1. 变更内容
lightdash lint -p ./lightdash      # 2. schema 校验
lightdash upload --validate        # 3. 上传 + 服务端语义校验（图表/看板字段失效、metric 缺失、排序错）
lightdash diff -d <slug>           # 4. 与平台现状对比，确认无意外覆盖
```

人工 checklist：

- [ ] 改过图表名 → 所有引用它的看板 tile 的 `title` + `chartName` 同步更新
- [ ] `chartSlug` / `tabSlug` 引用均存在
- [ ] `contentType` 已写；所有层级 key 字母序
- [ ] filter 值真实存在
- [ ] `metricQuery.dimensions` 与 chartConfig 维度一致
- [ ] 删除前已确认无其他看板引用

---

## 10. Open Questions（待拍板）

| # | 问题 | 建议 | 拍板人 |
|---|---|---|---|
| Q1 | 是否新建独立 Lightdash project 作为沙箱？ | **不新建**；语义层用 `lightdash preview`，内容层用 Space `ld-dev` | |
| Q2 | as-code 是否入库（git）？ | 客户内容仓入库（需评审与 CI）；本地 scratch 目录不入库 | |
| Q3 | MCP 写工具的 scope 名 | 建议 `mcp:write`，与现有 `mcp:read` 并列 | |
| Q4 | `lightdash delete` 是否默认拒绝删被引用图表 | 建议默认拒绝，`--force` 跳过 | |
| Q5 | **资产仓落点**：公司内部统一仓 vs 客户各自建仓 | 建议：通用 `lightdash-content-kit`（公司维护）+ 客户内容仓（客户维护，继承模板） | |
| Q6 | **资产仓分发**：git 拷贝 vs 内部 npm | 建议先用 git + 拷贝脚本起步；客户数 >3 或需统一升级时转内部 npm | |
| Q7 | CLI 增强是否同步上游（提 PR） | 建议 `delete` / `--validate` 提上游 PR；`diff` fork-only（上游暂无此需求） | |
| Q8 | MCP 写工具是否进 EE/社区版 | 需按 license 与权限模型评估后定 | |

---

## 11. 参考

- as-code 类型：`packages/common/src/types/contentAsCode/{charts,dashboards}.ts`
- as-code schema：`packages/common/src/schemas/json/{chart,dashboard}-as-code-1.0.json`
- CLI 上下传：`packages/cli/src/handlers/download.ts`（upload 在同一文件）、lint：`packages/cli/src/handlers/lint.ts`、validate：`packages/cli/src/handlers/validate.ts`
- 后端 as-code 往返：`packages/backend/src/services/CoderService/CoderService.ts`
- 删除通道：`packages/backend/src/routers/{savedChartRouter,dashboardRouter}.ts`
- 校验 API：`packages/backend/src/controllers/validationController.ts`
- 自定义图表渲染机制：`docs/custom-viz-guide.md`
- MCP 工具注册：`packages/lightdash-mcp/src/mcp/tools/`、`registerToolTyped.ts`
- 技能包定位与发版：`packages/lightdash-skills/{README.md,CLAUDE.md,MAINTAINERS.md}`
- 上游官方 skill（移植蓝本）：`skills/developing-in-lightdash/`（上游仓库 main 分支）
