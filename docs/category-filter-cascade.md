# 类目筛选器联动

## 职责划分

| 能力                                                     | 数据源                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 看板可见性（客户使用模式 + viewer / interactive_viewer） | Admin RPC `findAllDashboardByMobile`（未配置 `ADMIN_API_HOST` / `ADMIN_API_KEY` 时不调，只走 CASL） |
| 类目默认值 / 父子联动 / 下拉选项                         | `field/search`（含 `dashboardSlug` → dbt `sql_filter` / `dim_ld_employee_categories`）              |

类目联动**不再**调用 Admin 类目树（已移除 `GET /dashboard-categories`）。

## 前置条件

- 非编辑模式，且已有 `projectUuid` 与 `dashboardSlug`（slug 未就绪时不初始化 / 不联动，避免按 `NA` 绕过控制码）
- 联动 `field/search` 会带上目标筛选项**左侧**已有值的条件（如时间）以及父级类目，与下拉级联对齐

## 核心思路

首次加载和父改子联动使用同一套逻辑：

1. 用 `field/search` 取仓库实际可选类目（左侧筛选 + 父级 + `dashboardSlug`）
2. 当前值在结果中 → 保留
3. 否则 → 取结果第一个（第一个有权限且底层表真实存在的类目）
4. 请求成功但结果为空 → **无法区分**「底层表确实没有该类目」与「行级过滤（`sql_filter`）把候选值全部过滤掉」：
   - 先按级联条件查一次，无候选时再按**不带级联**的条件兜底查一次
   - 兜底查询有候选值 → 当前值有效则保留，否则取兜底的第一个
   - 兜底查询也为空 → **保留原值**（既不清空也不禁用）
5. 请求失败 → 无法判断，保留原值（不改变用户筛选语义）

> **为什么空结果不再清空筛选器** > `field/search` 的空结果有两种成因，接口层面无法区分：类目在表里真的不存在，或行级控制码把候选值全过滤掉了。
> 误清空会直接抹掉看板里已经保存的类目，且由于筛选器同时被置为 `disabled`，
> 后续的初始化与联动都会跳过它，**该筛选器再也回不来**（表现为「底层表有值，但筛选器里选中的值为空」）。
> 因此空结果一律保留原值，候选值缺失只会让下拉列表少几个选项，不会丢用户的选择。

类目权限与存在性**统一以底层表实际查询结果为准**，不再依赖 Admin 用户类目接口（admin 用户同样走这套逻辑）。

## 用户选择不被自动逻辑覆盖

- 初始化（`initializeCategoryFiltersAsync`）与联动（`updateCategoryFilterCascadeAsync`）使用**独立的 generation**：
  自动初始化不会作废用户刚刚的选择，用户的选择也不会被自动初始化重置
- 用户手动改动类目时：立即把选择写入筛选状态（与普通筛选一致，会置 `haveFiltersChanged` 并记录 saved filter override，
  否则选择无法保存、刷新后会变回空值），随后的联动只修正**子孙级**
- 联动之后的初始化会跳过用户刚刚改的那一级（`skipFilterIds`），显式选择优先于自动解析

## 三种场景

### 场景 1: 首次加载（看板初始化，非编辑模式）

- 配置了默认值的类目筛选器（`disabled === false`）
- 当前值在 `field/search` 结果中 → 保留
- 否则 → 切换到第一个实际值
- 处理顺序按**类目层级（一级 → 四级）**，父级先重置，子级再基于新的父级值重新解析（级联）
- 父级无候选值时，子级保留当前值（不连带清空）
- 恢复旧版本遗留的「被清空并禁用」的类目筛选器：重新解析出值并重新启用（`disabled: false`）

### 场景 2: 用户切换父级筛选器

- 子级按父条件 + 左侧筛选再查 `field/search`
- 当前值有效 → 保留，并继续向下级联
- 当前值无效 → 切换到第一个，再向下级联

### 场景 3: 用户手动修改子级

- `operator !== EQUALS`（如 NOT_NULL）→ 不被联动覆盖

## 可信 dashboard context

`field/search` 携带的 `dashboardSlug` 会参与 dbt `sql_filter`（行级控制码）。因此后端会先用数据库校验该 slug：

- 看板必须属于目标项目
- 当前用户必须有该看板所在空间的查看权限（CASL）
- 客户使用模式下看板必须在白名单内

校验失败时**不会回退使用客户端传来的 context**（避免伪造 slug 绕过行级过滤），此时按普通 ad-hoc 查询口径校验 explore 白名单。

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
3. 首次加载：`field/search` 返回空 → 保留原值（不清空、不禁用）；兜底查询（不带级联）有候选时按兜底结果取值
4. 首次加载：请求失败 → 保留原值
   4.1 首次加载：筛选器处于「已清空 + 禁用」状态 → 恢复出值并重新启用
5. 父改子：子级无效 → 切到第一个；有效 → 保留
6. 联动请求 SQL 含 `short_name = dashboardSlug`（非 `NA`）
7. 已选时间等左侧条件时改一级：二级落在该时间 + 父级下有数的值
8. 用户改为非 EQUALS → 不被覆盖
9. 编辑模式 → 不自动改筛选值
10. 客户端伪造 `dashboardSlug` → 后端校验失败，不使用该 context
11. 用户选中一级类目 → 立即显示并可保存；二级类目不会被自动清空
12. 自动初始化与用户选择并发 → 用户的选择不被丢弃
