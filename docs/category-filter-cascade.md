# 类目筛选器联动

## 职责划分

| 能力 | 数据源 |
|------|--------|
| 看板可见性（客户使用模式 + VIEWER） | Admin RPC `findAllDashboardByMobile` |
| 类目默认值 / 父子联动 / 下拉选项 | `field/search`（含 `dashboardSlug` → dbt `sql_filter` / `dim_ld_employee_categories`） |

类目联动**不再**调用 Admin 类目树（已移除 `GET /dashboard-categories`）。

## 前置条件

- 非编辑模式，且已有 `projectUuid` 与 `dashboardSlug`（slug 未就绪时不初始化 / 不联动，避免按 `NA` 绕过控制码）
- 联动 `field/search` 会带上目标筛选项**左侧**已有值的条件（如时间）以及父级类目，与下拉级联对齐

## 核心思路

首次加载和父改子联动使用同一套逻辑：

1. 用 `field/search` 取仓库实际可选类目（左侧筛选 + 父级 + `dashboardSlug`）
2. 当前值在结果中 → 保留
3. 否则 → 取结果第一个
4. 无结果 → 不强制改值

## 三种场景

### 场景1: 首次加载（看板初始化，非编辑模式）

- 配置了默认值的类目筛选器（`disabled === false`）
- 当前值在 `field/search` 结果中 → 保留
- 否则 → 切换到第一个实际值

### 场景2: 用户切换父级筛选器

- 子级按父条件 + 左侧筛选再查 `field/search`
- 当前值有效 → 保留，并继续向下级联
- 当前值无效 → 切换到第一个，再向下级联

### 场景3: 用户手动修改子级

- `operator !== EQUALS`（如 NOT_NULL）→ 不被联动覆盖

## 关键代码

- [`packages/frontend/src/utils/categoryFilters.ts`](../packages/frontend/src/utils/categoryFilters.ts)
  - `initializeCategoryFiltersAsync`
  - `updateCategoryFilterCascadeAsync`
- [`packages/frontend/src/providers/Dashboard/DashboardProvider.tsx`](../packages/frontend/src/providers/Dashboard/DashboardProvider.tsx)
  - 非编辑模式且存在 `dashboardSlug` 时触发初始化/联动
  - 传入 `dashboardSlug` / `dashboardName`

## 验证

1. 首次加载：默认值在实际数据中 → 保留
2. 首次加载：默认值不在实际数据中 → 切到第一个
3. 父改子：子级无效 → 切到第一个；有效 → 保留
4. 联动请求 SQL 含 `short_name = dashboardSlug`（非 `NA`）
5. 已选时间等左侧条件时改一级：二级落在该时间 + 父级下有数的值
6. 用户改为非 EQUALS → 不被覆盖
7. 编辑模式 → 不自动改筛选值
