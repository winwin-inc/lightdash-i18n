# feat/v2-upgrade 预发冒烟清单

> 主迁移代码已合入 `feat/v2-upgrade`；本清单用于 Step 5 发布前验收。  
> **本轮（2026-09-07）**：本地 FF env 已写入 `.env.development.local`；自动化单测门禁已跑（见 §一 / §八-b）；远程 PG `192.168.18.242` 与 Docker 不可用，**migrate 与 UI 手测需预发/本地库就绪后补勾**。

## 发版 tag 约定（OSS / 静态资源）

| Tag | 含义 | GitHub Actions OSS | 运行时静态 |
|-----|------|--------------------|------------|
| `v2.0.1` | 正式发版 | **上传** OSS | CDN（现网） |
| `v2.0.1-test.1` | 试跑 | **跳过**上传（job 仍绿） | 后端托管镜像内 `frontend/build`（忽略 env 中的 `CDN_BASE_URL`） |

判定规则：版本匹配 `x.y.z-<prerelease>`（如 `2.0.1-test.1`、`2.0.1-rc.1`）即为预发布。  
试跑部署请勿用 `STATIC_FILES_VERSION=2.0.1` 覆盖镜像版本，否则会按正式版走 CDN。

生产入口：`docker/prod-entrypoint.sh` 先在 monorepo 根 migrate，再 `cd packages/backend` 启动（避免 `MODULE_NOT_FOUND`）。

## 一、发布前（CI / 本地可跑）

```bash
pnpm v2:verify
```

或分步执行：

```bash
pnpm -F common typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck
pnpm -F common build
pnpm generate-api
pnpm -F @lightdash/mcp test
cd packages/backend && npx jest MergeQueryBuilder.test.ts
cd packages/common && npx jest src/utils/filters.test.ts src/types/applyMetricOverrides.test.ts
```

本轮自动化结果（2026-09-07）：

- [x] `@lightdash/formula` test — 382 passed
- [x] `@lightdash/mcp` test — 126 passed
- [x] common `additionalMetrics` + `periodOverPeriodComparison` — passed
- [x] common `filters` + `applyMetricOverrides` + `applyDimensionOverrides` — 47 passed
- [x] backend `periodOverPeriodQueries` + `TotalQueryBuilder` — passed（51 tests）
- [x] backend `MergeQueryBuilder` — 59 passed（含 18 snapshots；BigQuery `projectId` 类型断言已修）
- [x] 完整 `pnpm v2:verify`（含 warehouses/backend/frontend typecheck + generate-api）— 2026-09-08 通过（此前 warehouses 失败为 Docker 弄坏 `node_modules` 链接，重装后恢复）

## 二、数据库迁移（预发必须先于应用）

1. 确认环境变量：`LIGHTDASH_SECRET`、`PG*` 等（见 `.env.development.local`）
2. 执行：`pnpm -F backend migrate`（生产镜像见 `docker/prod-entrypoint.sh`）
3. 确认以下 migration 已应用：
   - `20260901140000_add_table_groups_to_projects`
   - `20260901150000_add_results_cache_ttl_to_projects`
   - `20260901150100_add_used_parameters_to_query_history`
   - `20260901160000_create_saved_query_version_merges`
   - `20260907130000_add_formula_to_table_calculations`（幂等；勿再跑已删除的 `20260908120000` 重复脚本）
   - `20260907130100_add_total_mode_to_table_calculations`（幂等）
   - `20260907140000_add_pop_additional_metrics_columns`（PoP additional metric 元数据列，幂等）
   - `20260907150000_add_query_timezone_to_projects`（`query_timezone` + `use_project_timezone_in_filters`）
   - `20260907160000_add_timezone_to_users`（`users.timezone`）

> **迁移风险**：重复 `formula`/`total_mode` 的 `20260908*` 文件已删除。`up` 含 `hasColumn` 守卫，避免二次加列导致 migrate 失败、生产入口不起服。  
> **本轮**：migration 文件齐全；对 `192.168.18.242:5432` 执行 migrate 时 **ECONNREFUSED**（库未起）。预发必须补跑。

## 三、特性开关（预发 env，无需 PostHog）

| 环境变量 | 功能 | 本地 `.env.development.local` |
|----------|------|-------------------------------|
| `MERGE_QUERIES_ENABLED=true` | 合并查询 | 已写入 |
| `DASHBOARD_TABS_IN_MEMORY=true` | Tab 切换保留图表实例 | 已写入 |
| `LOCK_DASHBOARD_FILTERS_ENABLED=true` | 看板筛选器锁定 UI | 已写入 |
| `RESULTS_CACHE_ENABLED=true` | 项目结果缓存 TTL | 已写入 |
| `ENABLE_TIMEZONE_SUPPORT=true` | Explore 查询时区选择器（`EnableTimezoneSupport`） | 已写入 |

> **时区 FF 说明**：`EnableTimezoneSupport` **仅能通过环境变量开启**，界面无法切换。关闭时主查询仍用服务器 `query.timezone`（默认 UTC）。开启后走 `resolveQueryTimezoneForAccount`（项目 / 用户 / 图表级时区），并启用：
> - 时间维 `DATE_TRUNC` / EXTRACT 时区感知（`useTimezoneAwareDateTrunc`）
> - 筛选：`TimestampFilterContext` + `useProjectTimezoneInFilters` 时 FilterDateTimePicker 按项目时区显示/回写
> - 用户资料「默认时区」（`users.timezone`）+ 图表 `ChartTimezoneSelect`（`user_timezone` / `project_timezone`）
>
> 仍可后置（不阻塞主闭环）：warehouse `dataTimezone` 表单 UI、结果区 `resolvedTimezone` 标注、process 非 UTC 告警。

**重启 backend 后**前端刷新即可生效。

## 四、合并查询（Merge Query）

代码接线：✅ `features/mergeQuery` + FF + 保存 `saved_queries_version_merges`；单测：`MergeQueryBuilder`（修复后请复跑）。

- [ ] Explorer 打开 merge 入口，选择第二份 explore（**需 UI**）
- [ ] 配置 join 字段与 join 类型，Run 成功（**需 UI**）
- [ ] 保存图表，关闭后重新打开，merge 图与字段选择一致（**需 UI**）
- [ ] 下载/导出结果（走通用 download，非 DuckDB）（**需 UI**）

## 五、看板 Tabs + 筛选器

代码接线：✅ `DashboardTabs` / hidden / URL filters / lock filters。

- [ ] 多 Tab 看板：切换 tab，图表不闪断重建（懒挂载 + 已访问 tab 保留）（**需 UI**）
- [ ] 隐藏 tab：view 模式不可见，edit 模式可显示/隐藏（**需 UI**）
- [ ] Tab 级筛选 + 全局筛选：切换 tab 筛选不丢失（fork 超集）（**需 UI**）
- [ ] URL `?filters=` 深链：覆盖 saved filter 生效（**需 UI**）
- [ ] 锁定筛选器：edit 模式锁定后，view 模式 URL override 被忽略并 toast（**需 UI**）
- [ ] 动态日期 / 类目筛选：与 override reconcile 无冲突（**需 UI**）

## 六、Nested Table Groups + Results Cache

- [ ] `table_groups`：经 **`lightdash.config.yml` + deploy/preview** 写入（CLI `replaceProjectTableGroups`）；Explore 侧边栏树形分组可见（**非**项目设置页表单；需 deploy + UI）
- [ ] 项目 Results Cache TTL 可读写（设置页 `/caching` — **需 UI**；代码接线 ✅ `ProjectResultsCache`）

## 七、MCP / 嵌入

- [x] `pnpm -F @lightdash/mcp test`（126 通过，2026-09-07）
- [ ] PAT 调用：list projects / run metric query / dashboard tiles（**需预发服务**）
- [ ] 嵌入看板 direct 模式 + filters URL（**需预发服务**）

## 八、回归（勿退化）

代码路径存在：✅ scheduler / CSV export。

- [ ] 旧书签看板 URL 仍可打开（**需 UI**）
- [ ] CSV/Excel 导出空单元格与格式化（fork 定制）（**需 UI**）
- [ ] 定时推送 / 类目权限看板（**需 UI**）

## 八-b、Formula + Period-over-Period（主服务闭环）

### Formula
代码 + 包测：✅ `@lightdash/formula` 382；Modal/validate API 已接线。

- [ ] 表计算 Modal 可选 Formula 模式（仓库方言在 SUPPORTED_DIALECTS 内）（**需 UI**）
- [ ] 编写简单公式 → validate API 通过 → Run 出列（**需 UI**）
- [ ] 保存图表后重开，formula / total_mode 仍在（**需 UI**）
- [ ] 开启 totals：纯标量 Formula 可出合计；含窗口/sum-of-rows 时合计可空白或报不支持（**需 UI**；`TotalQueryBuilder` 单测已覆盖 SQL 路径）

### Period-over-Period
单测：✅ `periodOverPeriodComparison` + `periodOverPeriodQueries`（含 fanout `cte_pop_*`）。

- [ ] Explore 选日期维（日/周/月/季/年）+ 指标，列头菜单「添加同期对比」（**需 UI**）
- [ ] Modal 选时间维与 offset，确认后出现 PoP 列；Run 有上一期数值（**需 UI**）
- [ ] 保存图表后重开，PoP additional metric 仍在（**需 UI**）
- [ ] 未选时间维时，列头入口不可用或 Modal 提示需先加时间维（**需 UI**）
- [x]（可选）存在 join inflation 时，SQL 含 `cte_pop_*` — **单测覆盖**

### 项目查询时区
代码：✅ `SettingsQueryTimezone` / `ChartTimezoneSelect` / Profile / `resolveQueryTimezoneForAccount` / trunc+EXTRACT+TimestampFilterContext。

- [ ] 项目设置 →「查询时区」可保存 `queryTimezone`（**需 UI**）
- [ ] `ENABLE_TIMEZONE_SUPPORT=true` 时：Explore RunQuerySettings 有时区；Header 用 `ChartTimezoneSelect`（**需 UI**；接线 ✅）
- [ ] 开 FF 后改项目时区：按日/月分组边界应跟项目时区（DATE_TRUNC 时区感知）（**需 UI**）
- [ ] 开 `useProjectTimezoneInFilters`：绝对日期筛选输入按项目墙钟显示（**需 UI**）
- [ ] 用户资料「默认时区」可保存；图表选「用户时区」时 resolve 到该区（**需 UI**）
- [x] PoP + join inflation：fanout SQL 含 `cte_pop_*`（单测；无 FF 门控）
- [x] 复杂 totals（metric filter / sum-of-rows）：`TotalQueryBuilder` 单测可生成合计 SQL，不再一律 NotSupported

```bash
# 自动化冒烟（本地，Windows 先设 $env:TZ='UTC'）
cd packages/common && npx jest src/utils/additionalMetrics.test.ts src/types/periodOverPeriodComparison.test.ts
cd packages/backend && npx jest src/utils/QueryBuilder/periodOverPeriodQueries.test.ts src/utils/QueryBuilder/TotalQueryBuilder.test.ts
# 迁移（预发必跑；失败会导致 prod-entrypoint 不起服）
pnpm -F backend migrate
```

## 九、主迁移未完成（后置，本清单不阻塞发布）

| 项 | 说明 |
|----|------|
| Project Chart Types | 依赖 Data Apps 全栈；**前置**：query-sdk ✅、common `ee/apps` types ✅、`features/apps` UI+路由 ✅；下一步接 `features/chartTypes`（sandbox 真跑通可并行） |
| Data Apps 运行时 | **运行时收口已落地**：CASL/Health/路由/pages/Dashboard tile ✅；后端 AppModel+API+preview+migrations ✅；Sandbox 真跑通 / generate 端到端仍待第二刀 |
| External Sources | DuckDB 运行时 + 多表 migration |
| ~~query-sdk 包~~ | **已引入** |
| ~~common ee/apps 宿主类型~~ | **已引入** |
| i18n ns 硬重构 | 5 域 PR，删巨型 translation.json |
| Honest Metadata 剩余 | 主路径已齐；warehouse `dataTimezone` UI / viz `resolvedTimezone` 仍可后置 |
| EE 解绑 | Direct Access / Homepage / Autopilot |
| ~~PoP fanout CTE~~ | **已移植** |
| ~~项目级 queryTimezone~~ | **已移植**；FF 仅 env |
| ~~Formula totals（标量）~~ | **已移植** |
| ~~users.timezone~~ | **已移植** |
| ~~timezone-aware trunc + 筛选~~ | **已移植**（含 TimestampFilterContext / EXTRACT wrap） |
| ~~MQB totalConfiguration~~ | **已移植** |
| ~~ChartTimezoneSelect / 用户时区哨兵~~ | **已移植** |

> **CHANGELOG 增量高价值候选**（CJK 检索、Filter Requirements、导出/XLSX、Embed、Role Sets 等，不阻塞本清单发布）：见 [`v2-changelog-high-value-backlog.md`](v2-changelog-high-value-backlog.md)。

### 增量 P0 手测（本轮移植，不阻塞主清单）

| # | 项 | 预期 |
|---|----|------|
| P0-1 | 表计算 Modal | 「公式」选项与 Tab「模板 / 格式」为中文 |
| P0-2 | Data Ops 项目分组 | 「生产项目 / 预览项目 /（当前）」为中文 |
| P0-3 | Omnibar | 中文 1 字可出结果（不必凑满 3 字符） |
| P0-4 | 定时推送截图 | 中文看板截图字体可读（CJK 字体） |
| P0-5 | CustomSql 表计算 | 无 `manage:CustomSqlTableCalculations` 时 SQL 模式禁用并 toast |
| P0-6 | 看板锁筛 / 必填 | 必填筛选未填值时 `requiredDashboardFilters` 阻塞（含 any-of 组语义） |
| P0-7 | 定时交付筛选 | 必填/需求组未满足时 Scheduler 表单无法保存 |
| P0-8 | 看板定时 XLSX | 格式选项可选「分文件 ZIP」或「单个工作簿」；workbook 交付为一份多 sheet XLSX |

## 十、本轮 agent 完成项 vs 待预发手测

| 已完成 | 待预发（库 + 服务起来后） |
|--------|---------------------------|
| `.env.development.local` 开齐 5 个 FF | §四～§八 UI 勾选 |
| checklist 文案与迁移列表对齐现状 | §七 PAT / 嵌入 |
| Formula / PoP / Totals / MCP 自动化绿 | 重启 backend 后 FF 生效手测 |
| 代码接线核对（Merge/Tabs/Cache/时区等） | 预发部署 env 开齐 5 个 FF |
| BigQuery `projectId` 类型断言（解锁 Merge 单测加载） | |
| 本地 Docker DB migrate 成功（含 query_timezone 等） | |
| 完整 `pnpm v2:verify` 通过（2026-09-08） | |
