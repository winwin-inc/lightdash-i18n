# feat/v2-upgrade 预发冒烟清单

> 主迁移代码已合入 `feat/v2-upgrade`；本清单用于 Step 5 发布前验收。  
> 自动化项已在本地通过（2026-09-02），以下为需人工或预发环境执行的项。

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

## 二、数据库迁移（预发必须先于应用）

1. 确认环境变量：`LIGHTDASH_SECRET`、`PG*` 等（见 `.env.development.local` 模板）
2. 执行：`pnpm -F backend migrate`（生产镜像见 `docker/prod-entrypoint.sh`）
3. 确认以下 migration 已应用：
   - `20260901140000_add_table_groups_to_projects`
   - `20260901150000_add_results_cache_ttl_to_projects`
   - `20260901150100_add_used_parameters_to_query_history`
   - `20260901160000_create_saved_query_version_merges`
   - `20260907130000_add_formula_to_table_calculations`（幂等；勿再跑已删除的 `20260908120000` 重复脚本）
   - `20260907130100_add_total_mode_to_table_calculations`（幂等）
   - `20260907140000_add_pop_additional_metrics_columns`（PoP additional metric 元数据列，幂等）

> **迁移风险**：重复 `formula`/`total_mode` 的 `20260908*` 文件已删除。`up` 含 `hasColumn` 守卫，避免二次加列导致 migrate 失败、生产入口不起服。

## 三、特性开关（预发 env，无需 PostHog）

| 环境变量 | 功能 |
|----------|------|
| `MERGE_QUERIES_ENABLED=true` | 合并查询 |
| `DASHBOARD_TABS_IN_MEMORY=true` | Tab 切换保留图表实例 |
| `LOCK_DASHBOARD_FILTERS_ENABLED=true` | 看板筛选器锁定 UI |
| `RESULTS_CACHE_ENABLED=true` | 项目结果缓存 TTL |
| `ENABLE_TIMEZONE_SUPPORT=true` | Explore 查询时区选择器（`EnableTimezoneSupport`） |

> **时区 FF 说明**：`EnableTimezoneSupport` **仅能通过环境变量开启**，界面无法切换。关闭时主查询仍用服务器 `query.timezone`（默认 UTC）。开启后走 `resolveQueryTimezoneForAccount`（项目 / 用户 / 图表级时区），并启用：
> - 时间维 `DATE_TRUNC` 时区感知（`useTimezoneAwareDateTrunc`）
> - 筛选输入在 `useProjectTimezoneInFilters` 开启时按项目时区显示/回写
> - 用户资料「默认时区」（`users.timezone`，解锁图表 `user_timezone`）
>
> 仍可能不完整：filtersCompiler `TimestampFilterContext`、EXTRACT 命名时间帧、非 UTC `columnTimezone` / warehouse `dataTimezone`。

重启 backend 后，前端刷新即可。

## 四、合并查询（Merge Query）

- [ ] Explorer 打开 merge 入口，选择第二份 explore
- [ ] 配置 join 字段与 join 类型，Run 成功
- [ ] 保存图表，关闭后重新打开，merge 图与字段选择一致
- [ ] 下载/导出结果（走通用 download，非 DuckDB）

## 五、看板 Tabs + 筛选器

- [ ] 多 Tab 看板：切换 tab，图表不闪断重建（懒挂载 + 已访问 tab 保留）
- [ ] 隐藏 tab：view 模式不可见，edit 模式可显示/隐藏
- [ ] Tab 级筛选 + 全局筛选：切换 tab 筛选不丢失（fork 超集）
- [ ] URL `?filters=` 深链：覆盖 saved filter 生效
- [ ] 锁定筛选器：edit 模式锁定后，view 模式 URL override 被忽略并 toast
- [ ] 动态日期 / 类目筛选：与 override reconcile 无冲突

## 六、Nested Table Groups + Results Cache

- [ ] 项目设置可配置 `table_groups`，Explore 侧边栏树形分组
- [ ] 项目 Results Cache TTL 可读写

## 七、MCP / 嵌入

- [ ] `pnpm -F @lightdash/mcp test`（126 通过）
- [ ] PAT 调用：list projects / run metric query / dashboard tiles
- [ ] 嵌入看板 direct 模式 + filters URL

## 八、回归（勿退化）

- [ ] 旧书签看板 URL 仍可打开
- [ ] CSV/Excel 导出空单元格与格式化（fork 定制）
- [ ] 定时推送 / 类目权限看板

## 八-b、Formula + Period-over-Period（主服务闭环）

### Formula
- [ ] 表计算 Modal 可选 Formula 模式（仓库方言在 SUPPORTED_DIALECTS 内）
- [ ] 编写简单公式 → validate API 通过 → Run 出列
- [ ] 保存图表后重开，formula / total_mode 仍在
- [ ] 开启 totals：纯标量 Formula 可出合计；含窗口/sum-of-rows 时合计可空白或报不支持

### Period-over-Period
- [ ] Explore 选日期维（日/周/月/季/年）+ 指标，列头菜单「添加同期对比」
- [ ] Modal 选时间维与 offset，确认后出现 PoP 列；Run 有上一期数值
- [ ] 保存图表后重开，PoP additional metric 仍在
- [ ] 未选时间维时，列头入口不可用或 Modal 提示需先加时间维
- [ ]（可选）存在 join inflation 时，SQL 含 `cte_pop_*` 且仍有对比列

### 项目查询时区
- [ ] 项目设置 →「查询时区」可保存 `queryTimezone`
- [ ] `ENABLE_TIMEZONE_SUPPORT=true` 时：Explore RunQuerySettings 有时区；Header 不再单独显示选择器
- [ ] 开 FF 后改项目时区：按日/月分组边界应跟项目时区（DATE_TRUNC 时区感知）
- [ ] 开 `useProjectTimezoneInFilters`：绝对日期筛选输入按项目墙钟显示
- [ ] 用户资料「默认时区」可保存；图表选「用户时区」时 resolve 到该区
- [ ] PoP + join inflation：不设 FF 时 SQL 仍应含 `cte_pop_*`（fanout **无** FF 门控）
- [ ] 复杂 totals（metric filter / sum-of-rows）：合计可出数，不再一律 NotSupported

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
| Data Apps 运行时 | **运行时收口已落地**：CASL/Health/路由/pages/Dashboard tile ✅；后端 AppModel+API+preview+migrations ✅（`backend typecheck` 通过）；Sandbox 真跑通 / generate 端到端仍待第二刀 |
| External Sources | DuckDB 运行时 + 多表 migration |
| ~~query-sdk 包~~ | **已引入**；vizContext ↔ host 类型同步已恢复 |
| ~~common ee/apps 宿主类型~~ | **已引入** `types` / `sdkFeatures` / `dataAppVizConfigOptions`（不含 code/dataReferences/serializer 等） |
| i18n ns 硬重构 | 5 域 PR，删巨型 translation.json |
| Honest Metadata 剩余 | `used_parameters` 已落地；PoP / TotalQueryBuilder / 项目级 queryTimezone / users.timezone / trunc+筛选最小路径 / MQB totalConfiguration 已补齐。上游完整 TimestampFilterContext / dataTimezone 仍可后置 |
| EE 解绑 | Direct Access / Homepage / Autopilot |
| ~~PoP fanout CTE~~ | **已移植** |
| ~~项目级 queryTimezone~~ | **已移植**；FF 仅 env |
| ~~Formula totals（标量）~~ | **已移植** |
| ~~users.timezone~~ | **已移植**：migration + UserModel/Service + ProfilePanel（FF 门控） |
| ~~timezone-aware trunc + 筛选~~ | **最小路径已移植**：DATE_TRUNC 时区 + FilterDateTimePicker shift；TimestampFilterContext / EXTRACT 仍可后置 |
| ~~MQB totalConfiguration~~ | **已移植**：`source_rows` 嵌入；metric/table-calc filter、sum-of-rows totals 可生成 SQL |
