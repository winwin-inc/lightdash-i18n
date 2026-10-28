# 看板类目筛选器「父级有值、子级不联动」：排查结论与实施计划

> 关联文档：
>
> - [类目筛选器联动](./category-filter-cascade.md)（单作用域联动的既有语义）
> - [类目筛选器跨作用域绑定](./category-filter-cross-scope-binding.md)（全局 ⇄ Tab 的 `parentScope` / `parentTabUuid` 模型）
> - [看板筛选器性能排查](./dashboard-filter-performance-investigation.md)
>
> 状态：Stage 1 已实施（见文末「已实施」），Stage 2（跨 Tab 继承后触发级联）仍未实施
> 分支：`feat/tab-filter-category-binding`

---

## 一、问题现象

看板（C60 新品相关，含 `C60新品分布`、`新品热卖` 两个 Tab）：

- `二级类目` = 饮料（**作者配置的默认值**）
- `三级类目` = 任何值
- `四级类目` = 任何值
- 期望：父级（二级类目）取值变化时，子级自动填入该父级下**第一个合法类目**；两个 Tab 表现一致。

用户补充确认的信息：

1. 三个/四个类目筛选器**不是 disabled**（见下文事实 1）；
2. 两个 Tab 的时间筛选器**类型确实不同**（如"首单时间=最近 13 个月"与"月份=2026-09"），这是**预期差异，不是本次根因**；
3. 期望语义：**子级自动填入该父级下第一个合法类目**。

### 用户问题的直接回答

> "如果我切换为自己选定的值，切换 tab，里面另一个这种情况是不是也变为我选定的值？"

**会。** 同一字段的**用户显式选择**在所有 Tab 之间共享（选择层 + localStorage 记忆），切到另一个 Tab 时该字段会显示你选的值（`applySelectionToTabFilters`）。

**但有两个已知缺口：**

1. 接收 Tab 的**子级类目不会跟着重算** —— 跨 Tab 继承目前**只写值、不触发级联**（见事实 4）→ 本次计划 Stage 2。
2. 继承要求两边规则**兼容**：`operator`、日期 `settings` 形态、`categoryLevel`、`parentFieldId`、`fallbackType` 需一致且目标未被 disabled，否则**静默跳过**（不新建规则、不覆盖作者配置）。

---

## 二、已确认的代码事实（排查结论，附代码位置）

### 事实 1：`disabled` 的筛选器不会显示"是任何值"

`packages/frontend/src/components/DashboardFilter/ActiveFilters/Filter.tsx:738`：

```tsx
{displayFilterRule?.disabled ? (
    <Text span color="gray.6" truncate>
        {t('components_dashboard_filter.filter.filter_rules.part_1')}
    </Text>
) : (
    <>
        <Text span color="gray.7">{filterRuleLabels?.operator} </Text>
        <Text fw={700} span truncate>{filterRuleLabels?.value}</Text>
    </>
)}
```

- `disabled === true` → **只显示筛选器名字**（灰色），不渲染"是 任何值"；
- `disabled` 为假且无值 → 渲染"是 任何值"（zh 文案 `filter_rules.part_1` = "是任何值"）。

截图里三级/四级类目显示的是"**是 任何值**" ⇒ 这些规则是 **enabled + 无值**。

> ⚠️ 结论：**不要按"筛选器被禁用"排查**，也不要改 `disabled` 的既有语义。
>
> 顺带记录一个易误判点：新增看板筛选器时 `packages/common/src/utils/filters.ts:611` 的
> `disabled: !isTemporary` 会让"作者没配默认值"的新筛选器初始为 disabled —— 但那种情况下 UI 上**看不到**"是任何值"。

### 事实 2：是否类目筛选器**只看 `categoryLevel`**

`packages/frontend/src/utils/categoryFilters.ts:56`：

```ts
export const isCategoryField = (filter: DashboardFilterRule): boolean => hasCategoryLevel(filter);
```

`categoryLevel` 必须存在且为 1..4。

**没有 `categoryLevel` 的三级类目就是普通维度筛选器** → 永不进入类目初始化与级联 → 永远停在"是任何值"，父级怎么改都不联动。**这是当前最可能的根因。**

### 事实 3：enabled + 无值的类目筛选器**本来就会参与**初始化与级联

`packages/frontend/src/utils/categoryFilters.ts:595` / `:615`：

```ts
const shouldResolveCategoryFilter = (filter, recoverableFilterIds) => {
    if (!filter.disabled) return true;          // enabled → 一定参与
    return recoverableFilterIds?.has(filter.id) ?? false;
};
```

因此，若三级类目**配了** `categoryLevel` 却仍停在"任何值"，只剩两种可能：

| 可能 | 代码分支 | 表现 |
| --- | --- | --- |
| 候选被左条件过滤空 | `resolveCategoryFilterValueAsync` → `status: 'keep'`（`no-candidates`） | 静默保留空值 |
| 父级绑定失效（找不到父级 / 父级无值） | `resolveCategoryFilterValueAsync` → `status: 'clear'`（`parent-unresolved`） | 清空子级 → "任何值" |

两者**都没有任何提示或日志**，界面表现与"根本没配置"完全一样。

### 事实 4：跨 Tab 继承**只写值、不触发级联**

- `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx:672` `syncSelectionToAllTabs` → `applySelectionToTabFilters`（`packages/frontend/src/utils/userFilterSelections.ts:219`）；
- 该函数**只改写值**，不调用 `updateCategoryFilterCascadeAsync` / `updateCrossScopeCategoryCascadeAsync`；
- 对比：源 Tab 自己改值时走 `wrappedUpdateTabDimensionFilter` → `updateTabCascadeWithFieldSearch`（`DashboardProvider.tsx:503`）**是会级联的**。

⇒ 跨 Tab 继承后的接收 Tab，其子级永远停留在旧值/空值。

### 事实 5：只对 **active tab** 跑初始化

`DashboardProvider.tsx:2311` 的 effect：切到某 Tab 时才 `runTabCategoryInit(activeTabUuid, activeTabFilters)`（`DashboardProvider.tsx:1060`）。未访问过的 Tab 不解析。

### 事实 6：Tab 筛选器的权威存储

- Tab 级：`dashboard_tabs.filters`（JSONB）—— 读 `packages/backend/src/models/DashboardModel/DashboardModel.ts:1379`，写 `createVersion`；
- 全局级：`dashboard_versions.config->'filters'`；
- ⇒ 一次性数据修复 SQL 直接改 `dashboard_tabs.filters` 有效（改完必须备份）。

### 事实 7：缓存不是首要嫌疑

- 类目候选值缓存：`packages/frontend/src/utils/categoryFilters.ts` 的 `fieldSearchCache`（TTL 5s，key 含 `projectUuid + fieldId + tableName + 序列化后的筛选条件（含 operator/values/settings）+ dashboardSlug`）→ 父值或时间单位变化会生成不同 key；
- 图表查询缓存：前端 React Query key 含 `tabUuid` 与 `timezoneFixFilters`；后端结果缓存 key = `sha256('v3' + projectUuid + 编译后 SQL + timezone)`。

⇒ 父值/条件变化都会绕开缓存，**缓存不会造成"父级变了子级没变"**。

### 事实 8：子级是否参与联动的判定（最终语义）

**链路的连通性**由绑定关系决定（事实 9）；**子级是否参与联动**由「当前是否有确认
选中的值」决定：

| 父级绑定 | 子级当前值 | 是否跟随父级 | 说明 |
| --- | --- | --- | --- |
| 有 | 有值 | **跟随** | 即使作者没配默认值（`disabled: true`），用户自己筛过值就必须跟随 |
| 有 | 无值 | **不跟随** | 保持"任何值"，不发请求，并按"断链"清空它的后代 |
| 无 | 任意 | 不跟随 | 不是链上的子级，不参与级联 |

对应单测：`packages/frontend/src/utils/categoryFilters.test.ts` 的
*"cascades into a bound child that has a confirmed value"* /
*"does not cascade into a bound child without a confirmed value"* /
*"does not cascade into a child without a parent binding"* /
*"keeps a bound child without a default value empty"*。

### 事实 9：联动的**必要条件**是「绑定了父级筛选器」

- 只有显式绑定父级筛选器（`parentFieldId` + `parentScope` / `parentTabUuid`）的类目
  才是链上的子级；**不根据 `categoryLevel` 推断父级**。
- 未绑定父级的类目：既不参与级联，也不参与初始化赋值。
- 配置界面在「类目层级」变更时会自动绑定父级：
  同作用域上一级候选唯一 → 自动绑定；同作用域无候选但全局上一级唯一 → 自动绑定；
  存在多个同层级候选 → **不猜**，由作者在「父级筛选器」里显式选择。

---

## 三、根因判定表（诊断结论 → 修复分支）

| 诊断结论 | 根因 | 修复分支 |
| --- | --- | --- |
| 三/四级类目**无 `categoryLevel`** | 不是类目筛选器，从不参与初始化与级联 | **1-A** |
| 有 `categoryLevel`，但 `parentFieldId` 缺失/指错，或 `parentScope`/`parentTabUuid` 与父筛选器真实作用域不符 | 父级绑定失效 → `clear` 分支清空子级 | **1-B** |
| 配置齐全，`field/search` 响应为空（日志 `no-candidates`） | 候选被左条件过滤空 → 静默 `keep` | **1-C** |
| 配置齐全、响应非空，日志 `resolved` 但 UI 仍"任何值" | 解析结果被 generation / 签名守卫丢弃 | **1-D** |
| 两个 Tab 同一字段的 `parentFieldId`/`categoryLevel`/`operator`/`settings` 不一致 | 跨 Tab 继承被兼容闸门静默拒绝 | **1-B** + **Stage 2** |

---

## 四、Stage 0：诊断步骤（只读 + 一处最小日志）

### 0.1 查配置（只读 SQL）

```sql
-- 看板与版本
SELECT d.dashboard_uuid, d.name, d.space_id, v.dashboard_version_id
FROM dashboards d JOIN dashboard_versions v ON v.dashboard_id = d.dashboard_id
WHERE d.name ILIKE '%C60%' OR d.name ILIKE '%新品%'
ORDER BY v.dashboard_version_id DESC;

-- Tab 级筛选器（authoritative）
SELECT t.name AS tab_name, t.uuid,
       f->>'label' AS label, f->>'id' AS rule_id,
       f->'target'->>'fieldId' AS field_id, f->'target'->>'tableName' AS table_name,
       f->>'operator' AS op, f->'values' AS values, f->>'disabled' AS disabled,
       f->>'categoryLevel' AS level, f->>'parentFieldId' AS parent_field_id,
       f->>'parentScope' AS parent_scope, f->>'parentTabUuid' AS parent_tab_uuid
FROM dashboard_tabs t
CROSS JOIN LATERAL jsonb_array_elements(t.filters->'dimensions') f
WHERE t.dashboard_version_id = <version_id>
ORDER BY t.order, f->>'label';

-- 全局筛选器
SELECT f->>'label', f->>'id', f->'target'->>'fieldId', f->'values', f->>'disabled',
       f->>'categoryLevel', f->>'parentFieldId', f->>'parentScope'
FROM dashboard_versions v
CROSS JOIN LATERAL jsonb_array_elements(v.config->'filters'->'dimensions') f
WHERE v.dashboard_version_id = <version_id>;
```

### 0.2 抓运行时证据

demo 账号（`demo@lightdash.com` / `demo_password!`）打开该看板 → DevTools Network → 过滤 `field/`：

- 三/四级类目是否发出 `POST /api/v1/projects/:uuid/field/:fieldId/search`？
  - **没发出** → 该筛选器不是类目筛选器（`categoryLevel` 缺失）→ 1-A；
  - 发出但**响应数组为空** → 1-C；
  - 发出且**响应非空** → 1-D。
- 请求体 `filters.and` 带了哪些左侧条件？（关注"全国""全部业态""2026-09"这类值在底层表里是否真实存在）
- 切 Tab 时是否出现新的 `field/search`（验证事实 5：只跑 active tab 的 init）。

### 0.3 最小日志埋点（本次唯一的代码改动，DEV-only）

在 `packages/frontend/src/utils/categoryFilters.ts` 增加结构化调试日志，**仅 `import.meta.env.DEV` 为真时输出**：

- 字段：`filterId`、`fieldId`、`categoryLevel`、`parentFieldId`、`parentValue`、`outcome`（`resolved` / `no-candidates` / `parent-unresolved` / `error`）、`candidatesCount`；
- 位置：`resolveCategoryFilterValueAsync`（`:636`）的各返回分支、`cascadeChildrenAsync`（`:814`）跳过子级的分支；
- 目的：**一次复现即可判定根因**，不必反复抓包。

### 0.4 需要用户/客户确认的业务语义

补齐配置后子级会**开始参与过滤** → **图表数据会变少**。需确认客户接受这一语义；若客户希望"子级只约束下拉候选、不参与过滤"，属另开需求（本次不做）。

---

## 五、Stage 1：修复（必做，围绕配置/数据 + 最小日志）

### 1-A 类目层级缺失 → 补配置（最可能的修复）

**首选产品路径**（不改代码、可回滚）：

1. 编辑模式 → Tab 筛选器区「**批量绑定**」按钮（`packages/frontend/src/components/DashboardFilter/BatchBindModal.tsx`）；
2. 勾选三级/四级类目 → 弹窗按字段名/label 自动探测层级（`detectCategoryLevel` 支持 `cls1..cls4` 与"一级类目…四级类目"）并自动绑定父级（同 Tab 优先，其次全局）；
3. 保存看板。

**备选：一次性数据修复 SQL**（不自动执行，由用户/DBA 决定；两个 Tab 各执行一次；先备份）：

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS tmp_dashboard_tabs_backup AS
SELECT * FROM dashboard_tabs WHERE dashboard_version_id = <version_id>;

UPDATE dashboard_tabs t
SET filters = jsonb_set(
          COALESCE(t.filters, '{}'::jsonb),
          '{dimensions}',
          COALESCE((
              SELECT jsonb_agg(
                  CASE WHEN f->>'label' = '三级类目'
                       THEN f || jsonb_build_object(
                              'categoryLevel', 3,
                              'parentFieldId', <二级类目 fieldId>,
                              'parentScope', 'tab',
                              'parentTabUuid', t.uuid)
                       ELSE f END)
              FROM jsonb_array_elements(COALESCE(t.filters->'dimensions', '[]'::jsonb)) f
          ), '[]'::jsonb)
      )
WHERE t.dashboard_version_id = <version_id>;
-- 校验通过再 COMMIT;（不确定就 ROLLBACK;）
```

验证：刷新看板 → 三/四级类目应自动出现"第一个合法类目"值。

### 1-B 父级绑定错 → 补绑定

- `parentFieldId` = 上一级类目的 `target.fieldId`；
- `parentScope` / `parentTabUuid` 必须与父筛选器的真实作用域一致：
  - 父在同 Tab → `scope: 'tab'` + 本 Tab uuid；
  - 父在全局 → `scope: 'global'` + `null`；
- 优先用 UI（「筛选器配置 → 类目层级 / 父级筛选器」重选，UI 会自动回填作用域）；或用 0.1 的 SQL 改。

### 1-C 候选为空 → 只做可见化，不改语义

- **不改** field/search 的条件语义：空候选时无法区分"表里真没有该类目"与"行级过滤把候选都过滤掉"，乱填会造成脏数据；
- 靠 Stage 0.3 的 DEV 日志定位是哪条左条件过滤空了候选（特别检查"全国""全部业态""2026-09"在底层表里是否真实存在）；
- 若确认是"不限"哨兵值：另开**按 fieldId 精确**的改动（字段白名单 + 匹配值放常量模块 + 单测）。
  **禁止**用"中文值字符串白名单"全局生效 —— 会污染其它看板的候选口径。**本次不做。**

### 1-D 结果被守卫丢弃 → 修守卫

- 在 `shouldApplyCategoryInitResult` 拒绝写回处补 DEV 日志（generation 不符 / 签名不符），定位后修正。

### Stage 1 涉及文件

- `packages/frontend/src/utils/categoryFilters.ts`（0.3 的 DEV 日志；命中 1-D 时再改守卫）
- 数据/配置：1-A / 1-B 的 UI 操作或一次性 SQL（**由用户执行，不进代码库**）
- **不动**：`isRuleSelectionCompatible`、后端 field/search、`disabled` 语义、筛选器 pill 渲染、编辑态 UI 提示（i18n 双语改动，本次砍掉）

### Stage 1 验收

1. 改二级类目 → **本 Tab** 的三/四级类目自动填入该父级下第一个合法类目；两个 Tab 表现一致；
2. DEV 日志中每个类目筛选器都有明确 `outcome`，无静默分支；
3. 既有类目级联单测全绿（`categoryFilters.test.ts` / `categoryFiltersCrossScope.test.ts` / `categoryFilterInitHelpers.test.ts`），"disabled 子级不参与级联"的既有用例保持不变。

---

## 六、Stage 2：跨 Tab 继承后触发接收 Tab 级联（独立立项，可延后）

> 这是用户明确想要的缺口（事实 4），但它是**全局行为变更**：所有看板的跨 Tab 继承都会触发接收 Tab 用自己条件重新解析子级 → 图表数据可能变窄 + 请求量上升。
> **建议单独 PR、单独验证**，不与 Stage 1 打包。

**目标行为**：用户在某 Tab 显式选中类目值 → 值同步到其它 Tab 后，**每个"确实存在子级绑定"的 Tab** 用「全局 + 自己 Tab」的链和自己的左侧条件重跑一次类目级联；解析期间该 Tab 的图表查询等待（`pendingTabCategoryResolutions`），避免先出错版数据再刷新。

### 实现要点

1. **新增纯函数模块** `packages/frontend/src/utils/dashboardCategoryCascade.ts`（便于单测，Provider 只做接线）：
   - `planCrossTabCascades({ tabFilters, sourceRule, namespace, excludeTabUuid })` → `{ nextTabFilters, cascadeRequests: Array<{ tabUuid: string; ruleId: string; value: string | null }> }`；内部复用 `applySelectionToTabFilters` + `findRuleByIdentity`（`utils/userFilterSelections.ts:385`）；
   - `hasBoundChildren(chain, changedEntry)`：链中是否存在 `parentFieldId + parentScope + parentTabUuid` 指向该父级的子级；**没有子级绑定的 Tab 不发任何请求**（防请求风暴）。
2. **`DashboardProvider.tsx` 接线**（不在 `setState` updater 里做副作用、避免 stale closure）：
   - `syncSelectionToAllTabs` 保持**函数式 updater** 计算（base 是最新已提交状态）；updater 内只把结果写进一个 ref（幂等，StrictMode 双调用无害）；
   - 新增 `useEffect([tabFilters])`：读 ref → 逐条调用 `runTabCategoryCascade` → 清 ref。副作用放在状态提交之后，链路由已提交的筛选器计算。
3. **`runTabCategoryCascade({ tabUuid, filters, changedFilter, newValue })`**（与源 Tab 路径 `updateTabCascadeWithFieldSearch` 同构）：
   - bump `tabCategoryCascadeGenerationRef` / `tabCategoryInitGenerationRef`；
   - `updateCategoryFilterCascadeAsync(..., { scope: { location: { scope: 'tab', tabUuid }, chain: buildCategoryChain({ globalFilters, tabFilters: { [tabUuid]: filters } }, tabUuid) } })`；
   - `initializeCategoryFiltersAsync(cascaded, projectUuid, ctx, { skipFilterIds: [changedFilter.id] })`（用户显式选择优先）；
   - 写回前用 `shouldApplyCategoryInitResult`（generation + `getTabCategoryChainSignature` 双重守卫，**守卫是防 stale 的安全网**）；
   - 写回后 `markTabCategoryProcessed` + 清 `pendingTabCategoryResolutions[tabUuid]`；级联期间 pending=true，沿用 `CATEGORY_RESOLUTION_MAX_WAIT_MS` 超时保护。
4. 只在 `isCategoryField(changedRule)` 时级联；兼容闸门拒绝时既不写值也不级联；级联只写 `setTabFilters`，不走同步路径 ⇒ **无 Tab 间回环**。

### Stage 2 测试

- 新增 `utils/dashboardCategoryCascade.test.ts`：
  1. 目标 Tab 有同字段兼容规则 → 产生级联请求；
  2. 无该字段 → 不新建规则、不请求；
  3. `categoryLevel`/`parentFieldId`/`operator`/`settings` 不兼容 → 不写值不级联；
  4. 目标规则 `disabled` → 不同步不级联；
  5. 目标 Tab 无子级绑定 → **不产生级联请求**。
- 手工验证：改二级类目 → 切到另一 Tab → 同字段同值，子级用本 Tab 条件重新解析；Network 中每个 Tab 的 `field/search` 只带自己的左条件；级联期间不出错版数据；快速连选两个字段的类目，继承值都不丢。

---

## 七、检查命令

```bash
pnpm -F frontend typecheck
pnpm -F frontend lint
pnpm -F frontend test
```

---

## 八、风险与回滚

| # | 风险 | 缓解 / 回滚 |
| --- | --- | --- |
| 1 | **业务语义**：补齐配置后子级开始参与过滤 → 图表数据变少 | 需客户确认；不认可则另开需求（子级只约束候选） |
| 2 | **行为面**：Stage 2 是全局行为变更（数据变窄 + 请求量上升） | 独立 PR + 独立验证；只动 `DashboardProvider.tsx` + 新增 `utils/dashboardCategoryCascade.ts`，可整体 revert |
| 3 | **数据修复**：直接改 `dashboard_tabs.filters` | 必须先备份（计划内含备份语句）+ 低峰执行；优先用「批量绑定」UI；回滚 = 备份表还原 |
| 4 | 一次性 SQL 误伤同名 label 的其它筛选器 | SQL 以 `label` 精确匹配为目标，执行前先用 0.1 的 SELECT 确认命中行数 |

**明确不做（本次范围外）**

- 不改类目/时间字段的类型差异（已确认无关）；
- 不改后端 field/search 语义；
- 不改 `disabled` 语义；
- 不改 `isRuleSelectionCompatible`（跨 Tab 兼容闸门）；
- 不重构选择层 / localStorage；
- 不做编辑态 UI 提示（i18n 双语改动）与保存期绑定校验（后续按需另开）；
- 不用"中文值字符串白名单"改候选口径。

**工作区纪律**：仓库已有与本任务无关的未提交修改（promotion / SavedSql / Coder 等），实施时只动本计划列出的文件，不得覆盖或混入那些改动。


---

## 九、已实施（Stage 1 + 用户提示 + 仓库压力）

提交（分支 `feat/tab-filter-category-binding`）：

| 提交 | 内容 |
| --- | --- |
| `c45c0ad1e` | 抽取共享 `field/search` 串行队列（并发 1），筛选器自动补全接入 |
| `56f5df4c6` | 绑定父级的类目必须参与联动；类目解析失败/无候选给出提示；级联诊断日志；类目解析与自动补全共用队列 |
| `b0afb361f` | 类目层级自动绑定父级时不再猜候选，有歧义交由作者显式选择 |

要点：

1. **联动规则**（见事实 8 / 事实 9）
   - 只有绑定父级筛选器的类目才是链上的子级；未绑定的不参与（初始化也不赋值）。
   - 子级有确认选中的值 → 跟随父级（哪怕作者没配默认值，用户筛过值就要跟随）。
   - 子级没有值 → 不跟随，保持"任何值"，并清空它的后代。
2. **用户提示**：`CategoryResolutionIssue` / `onResolutionIssue` 上报
   - 请求失败 → error toast（固定 key `dashboard-category-resolution-failed`）
   - 级联无候选 → warning toast（固定 key `dashboard-category-no-candidates`）
   - 仓库资源超限 → 复用 `warehouse-resource-limit` 提示
   - 失败一律**保留原值**，不写坏看板
3. **诊断日志**（`[categoryFilters]` 前缀）
   - `Skip cascading <field>: no confirmed value (disabled), descendants will be cleared`
   - `Cascaded <field>: <old> → <new>`
4. **仓库压力**：类目 `field/search` 与筛选器自动补全共用同一个全局并发 1 的队列
   （`packages/frontend/src/utils/fieldSearchQueue.ts`），避免两者同时打满
   仓库引擎的全局内存额度（`HGERR_code 53200`）。

### 仍需人工确认

- 目标看板里三/四级类目是否**确实绑定了父级筛选器**（没有绑定请在配置界面补上）。
- 若已绑定仍不联动，请提供浏览器 Network 中
  `/projects/:projectId/field/:fieldId/search` 的响应，以及控制台里的
  `[categoryFilters]` 日志。
