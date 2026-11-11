# 文档索引

本仓 `docs/` 下的设计稿、排查记录与运维手册。**按主题分目录，不按时间分**；新文档请放到对应子目录，不直接堆在 `docs/` 根下。

| 目录                                   | 内容                                    |
| -------------------------------------- | --------------------------------------- |
| [`ops/`](./ops/)                       | 运维、部署、接入、环境问题处理          |
| [`cli/`](./cli/)                       | 本仓 CLI（看板跨环境同步）与内容即代码  |
| [`dashboard/`](./dashboard/)           | 看板筛选器、看板复制、dbt 侧配套方案    |
| [`visualization/`](./visualization/)   | 自定义图表（Vega-Lite）、图表颜色、表格 |
| [`mcp/`](./mcp/README.md)              | Lightdash MCP 服务（接入 / 上线 / 权限）|
| [`v2/`](./v2/README.md)                | V2 上游对齐迁移、发版说明、交测清单     |
| [`features/`](./features/)             | 其他产品能力（可见性范围、操作日志）    |
| [`dev-tooling/`](./dev-tooling/)       | 本地开发/编码工具链增强                 |

---

## ops/ — 运维与部署

| 文档 | 说明 |
|------|------|
| [分支管理](./ops/branch-manage.md) | `main` / `dev` / `feat/*` 与上游同步分支的约定 |
| [本地前端调试线上环境](./ops/local-frontend-debug-production.md) | 本地 Vite 连线上后端；代理与打包/CDN 的关系 |
| [CDN + OSS 改造方案](./ops/cdn-oss-integration-plan.md) | 静态资源上 CDN、上传走 OSS 预签名（完整方案） |
| [CDN + OSS 执行摘要](./ops/cdn-oss-integration-plan-executive.md) | 同上，给决策/评审看的短版 |
| [自托管：关闭官方遥测](./ops/self-hosted-disable-official-telemetry.md) | 硬关闭 RudderStack / PostHog 等外发 |
| [OIDC 登录/退出三种方式](./ops/oidc-logout-modes.md) | 本地退出 vs IdP 会话，静默重登怎么避免 |
| [组织管理员：OIDC 用户开通 API](./ops/org-admin-users-provision.md) | 预开通 + 绑定 `openid_identities`（单个 / 批量） |
| [大数据量导出（CSV/XLSX）优化](./ops/csv-export-performance.md) | 反馈原文、耗时构成与根因、已实施改动与实测值、产物一致性回测、后续可评估事项（**部分已实施**） |
| [查询性能优化方案](./ops/query-performance-plan.md) | 四件代码层能做的事（count 查询、连接复用、分页索引、导出复用）+ 数据层边界（**草案**） |
| [数仓查询超时后上游没有取消](./ops/warehouse-query-cancel.md) | 客户端超时只断 socket、MCP 把“还在跑”报成失败的机制与修复（**已实施**） |
| [导出与 API 分进程（scheduler 独立 Deployment）](./ops/export-scheduler-split.md) | 同一镜像换启动参数把 graphile worker 拆出去；k8s 清单、迁移竞争与验证步骤（**暂不实现**） |
| [一键导出整个看板（按 Tab 分 Excel）](./ops/dashboard-xlsx-export-plan.md) | 三种布局（每图一文件 / 单文件多工作表 / 按 Tab 分文件）对照、性能成本与上线前待办（**已实现，暂不上线**） |
| [report-server ⇄ Lightdash 空间授权排查与修复](./ops/report-server-lightdash-space-auth.md) | `is_auth`/`is_auth_project` 乐观标记导致「授权看似成功但用户无权限」；接口契约、判别 SQL、修复补丁（**排查结论／修复待开发**） |
| [fix-duplicate-chart-slugs.sql](./ops/fix-duplicate-chart-slugs.sql) | 重复 chart slug 的人工修复步骤（migration 注释里引用） |

## cli/ — CLI 与内容即代码

| 文档 | 说明 |
|------|------|
| [本仓 CLI 使用流程](./cli/cli-standalone-usage.md) | 安装指定版本、`download` / `upload`、校验 |
| [看板 YAML 与同步说明](./cli/dashboard-sync-current-cli-usage.md) | 本仓 YAML 扩展字段、权限、与官方 CLI 的差异 |
| [内容即代码开发闭环实施计划](./cli/content-as-code-dev-plan.md) | 图表/看板 as-code：CLI + 服务端校验 + MCP 写工具（**待开发**） |

## dashboard/ — 看板筛选器与看板能力

筛选器几条线有强关联，**改代码前先看 `dashboard-filter-flow-overview.md`**（全流程 + 功能保全清单）。

| 文档 | 说明 |
|------|------|
| [筛选器全流程与功能保全清单](./dashboard/dashboard-filter-flow-overview.md) | 全局/Tab 筛选、继承、重置的完整链路（入口文档） |
| [类目筛选器联动（单作用域）](./dashboard/category-filter-cascade.md) | 父子联动、默认值、`field/search` 口径 |
| [类目筛选器跨作用域级联（全局 ⇄ Tab）](./dashboard/category-filter-cross-scope-binding.md) | `parentScope` / `parentTabUuid` 模型 |
| [类目「父级有值、子级不联动」排查与计划](./dashboard/category-filter-not-cascading-diagnosis-plan.md) | 线上问题定位结论 + 分阶段实施（Stage 2 未实施） |
| [非类目字段绑定父级类目并自动解析候选值](./dashboard/dashboard-filter-bound-values-cascade.md) | 集团/品牌/商品等维度跟随类目重解析 |
| [筛选 / 首屏性能排查](./dashboard/dashboard-filter-performance-investigation.md) | 慢在数仓往返还是前端渲染，逐条结论 |
| [看板筛选「自定义 SQL 维度」可行性](./dashboard/dashboard-custom-sql-dimension-filters-feasibility.md) | 评估 + 已落地范围（自定义分箱仍不含） |
| [看板复制深克隆图表资源](./dashboard/dashboard-duplicate-deep-copy-plan.md) | 复制后 tile/tab 引用重映射与资源隔离 |
| [集团筛选「任何值」与趋势图 TOP15（dbt）](./dashboard/集团筛选任意值与趋势图TOP15-dbt方案.md) | 两表方案背后的 dbt 建模约定 |

## visualization/ — 自定义图表、颜色与表格

| 文档 | 说明 |
|------|------|
| [自定义图表运行机制](./visualization/custom-viz-guide.md) | Vega-Lite 基础 + Lightdash 注入数据的方式（入口文档） |
| [Custom Viz 响应式（PC / Mobile 双 spec）](./visualization/custom-viz-responsive.md) | `lightdash.responsive.mobile` 与限制 |
| [Vega Spec Label 改写流程](./visualization/rewriteVegaSpecFieldLabels.flowchart.md) | `rewrite: true` 时中文 label → fieldId |
| [AI 模板图表生成 API](./visualization/chart-template-ai-generate-api.md) | 与算法服务的接口契约（**草案**） |
| [多图表图例颜色同步方案](./visualization/chart-color-sync-plan.md) | 开「同步图表颜色」后的确定性取色 |
| [颜色同步：废弃色差顺延](./visualization/chart-color-sync-optimization.md) | 旧分配器为何废弃、现状实现 |
| [条形图分组颜色重复修复](./visualization/chart-color-generation-fix.md) | 仅未开同步时的顺序调色板扩展 |
| [自定义图表跟随看板同步颜色](./visualization/vega-lite-dashboard-color-sync.md) | Vega-Lite 接入看板色板（设计/实现中） |
| [表格可视化体验优化批次（W1–W4）](./visualization/table-ux-optimization-plan.md) | 列宽拖拽（编辑落库 / 查看本地记住）、表头不折行、重置、冻列偏移（**已实施**） |
| [表格列宽可拖拽调整（W1 详版）](./visualization/table-column-resize-plan.md) | 分支/实现细节、上游 PR 对照与已知坑 |
| [表格滚动卡顿排查](./visualization/table-scroll-performance.md) | 平表虚拟化 / 透视表 v2（Canvas）现状与逐项结论 |
| [图表错误态诊断与可恢复](./visualization/chart-error-diagnostics-plan.md) | 图打不开时看不到字段/类型；判定链以 explore 为准（v2）、P0 三步拆分、embed/minimal 门控（**草案**） |

## features/ — 其他产品能力

| 文档 | 说明 |
|------|------|
| [受限角色内容可见性（client-use）](./features/client-use-viewer-content-scope.md) | viewer / interactive_viewer 的可见范围与排障对照（**已实施**） |
| [操作日志 + 使用分析导出 i18n](./features/operation-audit-log-plan.md) | migration、列表展示、清除接口（**待开发**） |
| [维度按自定义值顺序排序（业态排序）](./features/custom-sort-order-plan.md) | `SortField.valueOrder` + CASE 排名 SQL + 排序面板多值编辑器（**草案/待确认**） |
| [自建 MCP 服务与 OAuth 认证](./features/self-hosted-mcp-with-oauth.md) | **已实施**：从 Lightdash 内嵌实现抽离的复用要点——无状态 Streamable HTTP、双通道鉴权、`validateScope` 交集发放、三起真实事故根因、最小可运行骨架、自建 OAuth 客户端清单与抽离切分线 |

## dev-tooling/

| 文档 | 说明 |
|------|------|
| [Claude Code 增强方案](./dev-tooling/claude-code-enhance.md) | 代码索引、规格驱动工作流、跨会话记忆的选型 |

---

## 维护约定

1. **新文档先选目录**：不确定就放到最接近的业务目录；纯历史记录放该目录即可，不要新建 `misc/`。
2. **交叉链接用相对路径**，移动文件后跑一次链接检查（见下）。
3. **文首写状态**：`已实施` / `待开发` / `草案` / `排查结论`，避免读者把历史方案当现状。
4. **不删历史**：已交付但仍有排障价值的方案保留并标状态；只有「纯跳转占位页」（如原 `docs/v2-*.md`）在正文索引接上后删除。
5. **根 `docs/` 只放本索引**，不再新增散落的 `.md`。

链接自检（无第三方依赖）：

```bash
python3 - <<'EOF'
import os, re
pat = re.compile(r'\[[^\]]*\]\(([^)\s]+)\)')
bad = []
for dp, _, fns in os.walk("docs"):
    for fn in fns:
        if not fn.endswith(".md"):
            continue
        p = os.path.join(dp, fn)
        for m in pat.finditer(open(p, encoding="utf-8").read()):
            t = m.group(1)
            if t.startswith(("http", "mailto:", "#")):
                continue
            tgt = os.path.normpath(os.path.join(dp, t.split("#")[0]))
            if t and not os.path.exists(tgt):
                bad.append(f"{p} -> {t}")
print("\n".join(bad) or "OK")
EOF
```
