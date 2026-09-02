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

## 三、特性开关（预发 env，无需 PostHog）

| 环境变量 | 功能 |
|----------|------|
| `MERGE_QUERIES_ENABLED=true` | 合并查询 |
| `DASHBOARD_TABS_IN_MEMORY=true` | Tab 切换保留图表实例 |
| `LOCK_DASHBOARD_FILTERS_ENABLED=true` | 看板筛选器锁定 UI |
| `RESULTS_CACHE_ENABLED=true` | 项目结果缓存 TTL |

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

## 九、主迁移未完成（后置，本清单不阻塞发布）

| 项 | 说明 |
|----|------|
| Project Chart Types | 依赖 Data Apps 全栈；**前置**：query-sdk ✅、common `ee/apps` types ✅；下一步需 `features/apps` 再接 `features/chartTypes` |
| External Sources | DuckDB 运行时 + 多表 migration |
| ~~query-sdk 包~~ | **已引入**；vizContext ↔ host 类型同步已恢复 |
| ~~common ee/apps 宿主类型~~ | **已引入** `types` / `sdkFeatures` / `dataAppVizConfigOptions`（不含 code/dataReferences/serializer 等） |
| i18n ns 硬重构 | 5 域 PR，删巨型 translation.json |
| Honest Metadata 剩余 | `used_parameters` 已落地；PoP 整包未引入 |
| EE 解绑 | Direct Access / Homepage / Autopilot |
