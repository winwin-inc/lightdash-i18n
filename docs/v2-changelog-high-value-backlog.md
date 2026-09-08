# 上游 CHANGELOG 高价值后置候选（0.2513 → 2.57）

> **用途**：罗列相对上游 `../lightdash` 在 **0.2513.0 → 2.57.0** 窗口内出现、**尚未写入**主迁移评估表（[`v2-upgrade-and-migration-guide.md`](v2-upgrade-and-migration-guide.md) §二）、但对**中文自托管 BI fork** 仍有明显价值的能力，供试跑稳定后排期。  
> **不阻塞**当前试跑门禁（FF + migrate + 最短手测，见 [`v2-smoke-checklist.md`](v2-smoke-checklist.md)）。  
> **本仓试跑版本**：`2.0.1-test.1`（≠ 上游版本号）。上游对照仓库当前为 **2.57.0**。

---

## 1. 背景与基线

| 项 | 说明 |
|----|------|
| 迁移窗口 | 上游 **0.2513.0 → 2.57.0**，按高价值模块正向移植 |
| 策略 | **禁止**整仓 `merge` / `rebase`；主清单见迁移指南 §二 |
| 本文档定位 | **增量候选 backlog**，不改写主迁移结论 |
| 与主闭环关系 | 主功能闭环开发侧已可收口；本文为下一波产品增量 |

---

## 2. 已覆盖（勿重复排期）

以下已在主迁移清单内（已完成 / 部分完成 / 已标后置），**不要**再当「新发现」重复立项：

| 状态 | 主题 |
|------|------|
| 已完成（主路径） | Formula、Query SDK、Nested Table Groups、Merge Queries、Results Cache TTL、Dashboard Tabs / Filter reconcile / 锁筛选、PoP、查询时区 MVP、Honest Metadata 主路径 |
| 部分完成 | Data Apps 运行时收口（UI/API/tile ✅；Sandbox / generate 端到端待） |
| 主清单已列、后置 | Project Chart Types、External Sources、Honest / 时区 P1 剩余、i18n ns 硬重构 |
| 主迁移明确不做解绑 | Direct Access、Homepage / Themes、Validator / Autopilot（EE 专项） |
| 明确不做 | 整仓对齐上游 2.57 全量 migration / 工具链全量追齐 |

---

## 3. P0 候选（下一波优先评估）

| 模块 | 对本仓价值 | 本仓现状 | 依赖与风险 |
|------|------------|----------|------------|
| **CJK 截图字体 + Omnibar 中日韩检索** | 定时推送/分享截图中文可读；搜索不必硬凑 3 字符 | 缺（如 `UnfurlService` 无 CJK 字体逻辑；搜索 `MIN_QUERY_LENGTH` 仍偏英文） | 与自研截图/推送链路交叉；改动面相对可控 |
| **Dashboard Filter Requirements**（含 scheduler 门禁） | 必填筛选未满足时拦截看板使用与定时推送，防空跑/错推 | 缺 | 需与自研 Tab 级筛选、动态日期、「在之间」筛选共存验证 |
| **看板异步导出 / 单 XLSX 多 sheet** | 多 Tab 交付刚需；运营常用 | 部分（有 CSV/Excel 导出基础；缺 workbook 布局等上游选项） | 注意保护 fork 导出空单元格/格式化定制 |
| **Embed 能力包**（编辑图、Export All、Parameters、写操作/事件） | 嵌入场景产品完整度跃迁 | 部分（基础 embed 有；缺上游完整编辑/导出/参数面板等） | **无嵌入客户可降为 P1**；与自研嵌入/类目权限对齐 |
| **Role Sets / 多角色组合** | 多项目、多类目权限比单角色更贴合 | 部分（有 customRoles 相关；无完整 `roleSets`） | 与 `CategoryRpc` / 类目权限打通成本需评审 |
| **SQL 编写权限收紧**（CustomSql / CustomSqlTableCalculations） | 私有化安全合规、可审计「谁能写自定义 SQL」 | 部分（有 `manage:CustomSql`；缺表计算侧完整门禁等） | 影响 Explore 作者体验；需权限矩阵与 i18n |

---

## 4. P1 候选

| 模块 | 对本仓价值 | 本仓现状 | 备注 |
|------|------------|----------|------|
| **Date Zoom 看板控件**（跨 Tab） | 看板级时间粒度切换 | 部分（有基础 DateZoom；缺完整 ControlConfig / Pills） | **强冲突面**：自研动态日期 + Tabs 超集，需专项设计 |
| **Pre-aggregates 预聚合** | 降数仓成本，与 Results Cache 互补 | 缺 | 运维与数仓侧配合重；量级中~大 |
| **透视表增强**（行合并 / 数仓合计 / 冻结列 / 列排序等） | Explore 表格分析升级 | 部分（有 Pivot 基础链路） | 与自研透视 150 列上限、对齐样式共存 |
| **Dashboard Ownership**（所有者 / 离职转让） | 资产治理闭环 | 缺 | 可与 Direct Access（EE）专项合并评估 |
| **Content-as-Code / Git write-back** | 多环境发布、可评审 | 缺 | **不做 GitOps 可 skip** |
| **Chart URL Slug 重命名** | 书签/外链稳定 | 边缘（迁移指南 mermaid 有提及，评估表弱） | 涉及路由/外链；需单独评估破坏性 |

---

## 5. 明确不进「高价值必迁」清单

CHANGELOG 体量大、但对当前试跑 / 主闭环 ROI 低或冲突大：

- **AI / ai-agents / deep-research / managed-agent / ai-writeback**（上游主战场；本仓有自研 MCP 另线，不全量追齐）
- **纯工具链全量追齐**（Node 24 / TS 7 / Turbo 等；Step 0 仅做入站适配水位）
- **整仓 rebase / 对齐 2.57 全量 migration**
- 国内渠道弱的投递（Google Chat / Teams 等，按需再开）
- Theme Packages 单独立项（随 EE Homepage 专项即可）

---

## 6. 建议落地顺序

试跑稳定后，建议按下列顺序评估（可按客户场景裁剪）：

1. **CJK 截图字体 + Omnibar 中日韩检索**（体验刚需、冲突面相对小）
2. **Dashboard Filter Requirements**（含 scheduler）
3. **看板异步导出 / 单 XLSX 多 sheet**
4. **Embed 能力包**（仅当有嵌入客户时提前）
5. **权限**（Role Sets → SQL 编写收紧；与类目权限一起评审）
6. **其余 P1**（Date Zoom 慎开；Pre-aggregates / Ownership / Content-as-Code / Slug 按业务取舍）

主清单内仍待的 **Chart Types / Data Apps 端到端 / External Sources / EE 解绑** 继续按其原依赖链推进，与本 backlog **并行不互相阻塞**。

---

## 7. 相关文档

- 主迁移全景与评估表：[`v2-upgrade-and-migration-guide.md`](v2-upgrade-and-migration-guide.md)
- 试跑冒烟与后置表：[`v2-smoke-checklist.md`](v2-smoke-checklist.md)
- 自动化门禁：`pnpm v2:verify`
