# 看板筛选器：非类目字段绑定父级筛选器并按候选值自动解析

> 关联：[类目联动](./category-filter-cascade.md)、[跨作用域绑定](./category-filter-cross-scope-binding.md)、
> [跨 Tab 继承](./dashboard-filter-flow-overview.md)、[排查记录 §13](./category-filter-not-cascading-diagnosis-plan.md)
>
> 触发场景（客户反馈，新品数据库看板）：在「C60 新品评估」等 Tab 里，类目筛选器能跨 Tab 继承，
> 但 `集团 是 海天` / `包装类型 是 单包装,多包装` / `商品名称 是 <5 个 SKU>` 这类**非类目字段**
> 保持旧值，与继承来的类目（如 调味品 → 醋）不匹配 → 切过去下面一张图都没有数据。

## 一、目标

1. 允许**普通 dimension 筛选器**（集团 / 品牌 / 包装类型 / 商品名称…）绑定一个**父级筛选器**：
   - 父级可以是类目（一~四级任意层级，含全局作用域的类目）；
   - 父级也可以是**另一个绑定父级的普通维度**，形成多级链：
     `类目 → 集团 → 品牌 → 商品`。

   约束（`isValidParentBinding`，UI 与运行时共用）：
   - 子级是类目（有 `categoryLevel`）→ 父级必须也是类目，且层级更低（保持原语义）；
   - 子级是普通维度 → 父级可以是类目或普通维度，但**不能成环**
     （沿 `parentFieldId` 向上走，遇到子级即拒绝；已有环也拒绝）。
2. 父级类目变化（用户手改 / 跨 Tab 继承 / 重置）后，按「父类目 + 链上左侧条件」重新解析这些字段的取值：
   - 当前值仍在候选里 → **保留**；
   - 单值无效 → 取**第一个候选**；
   - 多值 → 保留 `values ∩ 候选`，不足 N 个用候选补齐（**N = 当前 values 数量**，所以「商品 5 个」天然是 5）；
   - 「任何值」(`disabled`) → **不动**；
   - 候选为空 / 请求失败 / 链路断裂 → **保留原值**（不清空、不禁用）；
   - 结果与原值相同 → **不写、不标记**。
3. 被自动调整过的筛选器要在 pill 上留**可见标记**（tooltip 展示原值），避免「值被悄悄改掉」。

## 二、已确认的产品决策

| #   | 决策                         | 取值                                                                                   |
| --- | ---------------------------- | -------------------------------------------------------------------------------------- |
| ①   | 可绑定的父级范围             | **任意层级的类目筛选器**（不限制 3/4 级；全局类目也可以，沿用 `parentScope='global'`） |
| ②   | 多值补齐个数 N               | **自动推导 = 当前 `values.length`**（最小 1），不新增字段                              |
| ③   | 「任何值」是否自动填值       | **不动**（不主动收窄数据）                                                             |
| ④   | 用户手选但当前类目下无效的值 | **替换**（避免空图），同时在 pill 上加标记，可解释                                     |

## 三、数据模型：复用已有字段，零迁移

`DashboardFilterRule` 已有：

| 字段            | 用途                                       |
| --------------- | ------------------------------------------ |
| `parentFieldId` | 父级筛选器的 fieldId（非类目字段同样可用） |
| `parentScope`   | `global` / `tab`                           |
| `parentTabUuid` | 父级所在 Tab（跨 Tab 绑定）                |

不需要新字段，`dashboard-as-code` JSON schema 也不需要改。

## 四、为什么能复用现有机制（代码证据）

| 能力           | 位置                                                                                    | 说明                                                                             |
| -------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 候选值查询条件 | `utils/categoryFilters.ts:843 collectFieldSearchFilters`                                | 取链上**左侧**有效筛选器作为条件，不判断是否类目 → 「醋 下的集团候选」现在就能查 |
| 父级解析       | `findParentCategoryEntry` / `isValidParentBinding`                                       | 按 fieldId + 作用域匹配；子级无 `categoryLevel` 时放行任意父级（含普通维度），并做环检测 |
| 解析语义内核   | `:971 resolveCategoryFilterValueAsync`                                                  | 已是「值在候选 → 保留，否则 → 第一个候选」                                       |
| 执行骨架       | `:1552 initializeCategoryFiltersAsync` + 懒执行 + 5s `fieldSearchCache` + 世代/会话守卫 | 不重建                                                                           |
| 级联触发       | `:1269 cascadeChildrenAsync` + `:1132 getChildEntries`                                  | 目前 `getChildEntries` 只认类目子级                                              |

## 五、需要放宽/新增的代码点

| 位置                                        | 现状                                   | 改动                                                                      |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `:980 resolveCategoryFilterValueAsync`      | `!isCategoryField → keep`              | 新增 `resolveDependentFilterValuesAsync`（单值 + 多值），类目路径保持不变 |
| `:1137 getChildEntries`                     | 只认类目子级                           | 绑定父级的普通维度也算子级（新增 `isDependentValueFilter`）               |
| `:1598-1609 initializeCategoryFiltersAsync` | 跳过非类目、跳过 `operator !== EQUALS` | 类目循环之后处理绑定字段；**普通维度之间按 `parentFieldId` 拓扑排序**（`sortChainParentsFirst`，父级先解析） |
| `:513 getCategoryFiltersSignature`          | 只到「最后一个类目」为止               | 追加绑定字段的 `values/operator/父级绑定`，否则写回守卫看不见这些写入     |
| `:1059 sortCategoryFiltersByLevel`          | 只排类目                               | 顺序改为「类目按 level → 再按链顺序处理绑定字段」                         |

UI / Provider（P2）：

- `FilterConfiguration`：非类目维度增加「跟随父级筛选器」选择器 + 说明文案；
- `DashboardProvider`：接 `onValuesAutoAdjusted`，按 Tab 记录 `autoAdjustedFilterIds`，并在用户手改该字段 / 重新解析 / 重置 / 进编辑模式时清理；
- `ActiveFilters`：pill 上加标记（tooltip 展示被替换前的原值）；
- i18n：`public/locales/zh|en/translation.json` 新增 key。

## 六、请求量与执行时机

- 每个绑定字段 **1 次** `field/search`（`fieldSearchCache` 5s 内同条件可复用）；
- 必须**串行在类目之后**（先有类目值才有父条件）；
- 沿用懒执行：**未激活的 Tab 零请求**，切到该 Tab 时由 `runTabCategoryInit` 一次性跑完；
- 方向确定（父 → 子，只跑一轮，不回头）→ 不会自激；类目筛选器本身的级联策略（只处理被改级别的后代）不变。

估算（这块看板 4 个绑定字段）：改一次四级类目 ≈ 1（类目校验）+ 4 = 5 次；切到一个被继承过的 Tab ≈ 4（类目整链）+ 4 = 8 次，均在既有 pending / 10s 兜底内。

## 七、风险与护栏（含独立风险审查结论）

独立风险审查（审查记录未入库，原路径 `docs/agent-eval/non-category-binding-risks.md`）结论：**有条件可上**。下列 P0/P1 必须与功能一起上，否则会出现「用户选择被静默回滚」「父变子不变且无提示」两类难查反馈。

### P0（必须）

| #    | 问题                                                                                                                                  | 护栏                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | 写回是**整体替换**快照（`DashboardProvider.tsx` init `.then`），绑定字段不在签名里 → 守卫「假通过」，在途 init 结果把用户手改的值回滚 | 写回改为**按 filter id 合并**（只采纳本次解析涉及字段的 `values/disabled/operator`）；签名追加所有 `isBoundValueFilter` 条目 |
| P0-2 | 用户手改非类目字段不 bump generation / 不 cancel 会话 → 无法阻止在途写入接管                                                          | Tab 与全局两条手动修改路径：`bumpTabCategoryGeneration` + `cancelTabCategoryInitSession`（全局同理）                         |
| P0-3 | 环路防护只靠 `isValidParentLevel`，而它对「子级无 categoryLevel」直接放行                                                             | 改为 `isValidParentBinding`：允许普通维度作父级，但沿 `parentFieldId` 向上走到子级即拒绝（visited 防死循环）；级联遍历因此有界 |

### P1（同批上）

| #    | 问题                                                                                                  | 护栏                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| P1-1 | 绑定字段不在 `getChildEntries` / `clearDescendantsAsync` / `getDescendantCategoryFilterIds` 里        | 三处统一按 `isBoundValueFilter` 纳入                                                         |
| P1-2 | 跨 Tab 继承的 `parent-mismatch` 闸门要求 `parentFieldId` 严格相等，跨 mart 绑定后永久不兼容           | 两侧都是绑定字段时按「父级类目层级/身份」比较，并翻译父级引用                                |
| P1-3 | pending 预算固定 10s                                                                                  | 按绑定字段数估算（每字段 1 次请求，串行）                                                    |
| P1-4 | 重置后作者默认值可能仍无效                                                                            | 重置路径已 `invalidateTabCategoryState`（删 processed 签名）→ 下次激活必重算；不需要额外调用 |
| P2   | 批量绑定（`BatchBindModal`）目前只列类目；**禁止**用 `categoryLevel` 承载非类目绑定（不可逆语义污染） | 批量绑定另开 lane 或暂不支持；`categoryLevel` 只属于类目                                     |

### 其它

| 风险               | 护栏                                                                |
| ------------------ | ------------------------------------------------------------------- |
| 值被悄悄替换       | pill 标记 + tooltip 原值；重置可回到作者默认                        |
| 时间/区域被误伤    | 只有**显式绑定父级**的字段参与，默认不绑定 → 时间筛选器不受影响     |
| 空数据 vs 错误数据 | 只在候选有值时才替换；候选为空/请求失败保留原值（宁可空图也不乱填） |
| 请求放大           | 仅绑定字段 + 懒执行 + 5s 缓存；请求数上限 = 绑定字段数              |

## 七之二、实施状态（本轮已落地）

| 项                                                                   | 状态      | 落点                                                                      |
| -------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------- |
| 绑定关系复用 `parentFieldId / parentScope / parentTabUuid`（零迁移） | ✅        | `DashboardFilterRule` 未改；UI 单条绑定即可                               |
| 单值/多值解析（保留有效 + 补齐到 N）                                 | ✅        | `utils/categoryFilters.ts` `resolveBoundValuesAsync`                      |
| 级联触发（父类目 → 绑定字段）                                        | ✅        | `getChildEntries` + `cascadeChildrenAsync` 分流                           |
| 初始化阶段解析绑定字段                                               | ✅        | `initializeCategoryFiltersAsync` 类目循环之后                             |
| 签名覆盖绑定字段                                                     | ✅        | `getCategoryFiltersSignature` 追加 `boundValues`                          |
| 写回按 filter id 合并（防回滚）                                      | ✅        | `DashboardProvider.mergeAutoResolvedFilters`                              |
| 用户手改绑定字段时作废在途解析                                       | ✅        | `wrappedUpdateTabDimensionFilter` / 全局 `updateDimensionDashboardFilter` |
| 环路防护（父级可以是普通维度，但不能成环）                           | ✅        | `isValidParentBinding`（沿 `parentFieldId` 向上走 + visited）             |
| 跨 Tab 继承的 parent-mismatch 放宽（按父级层级比较）                 | ✅        | `userFilterSelections.getParentLevelKey`                                  |
| 「待解析」门禁（`hasCategoryFilters` → `hasBoundFilters`）           | ✅        | `categoryFilterInitHelpers` + Provider 4 处                               |
| pill 标记 + tooltip 原值                                             | ✅        | `autoAdjustedFilterIds` + `ActiveFilters` + `Filter.tsx` + i18n（zh/en）  |
| 筛选器配置：非类目只显示「跟随父级筛选器」                           | ✅        | `FilterSettings`（类目层级仅类目显示，避免误写 `categoryLevel`）          |
| 批量绑定支持非类目                                                   | ⛔ 暂不做 | `BatchBindModal` 依赖层级骨架；避免用 `categoryLevel` 承载非类目绑定      |
| pending 预算按字段数动态化                                           | ⏳ 未做   | 现为固定 10s 兜底；绑定字段多时可按数量估算                               |

验证命令：

```bash
cd packages/frontend && npx vitest run src/utils src/hooks/dashboard src/components/DashboardFilter
cd packages/frontend && NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck -p tsconfig.json
# 注意：不要用 `tsc -b`（composite 会在 src/ 里生成 .js/.d.ts 产物）
```

## 八、验收清单

1. 给「集团」绑定四级类目 → 手动把四级类目从 A 改到 B：「集团」自动变成 B 下的第一个集团，图表有数据，pill 上有标记；
2. 「商品名称」绑三级类目（5 个值）→ 切类目后仍保持 5 个 SKU（有效保留 + 补齐），不出现空图；
3. 「品牌」是「任何值」→ 不被自动填值；
4. 跨 Tab 继承类目后切过去：集团/商品跟着重算，未激活时 Network 无请求；
5. 用户手选一个当前类目下无效的集团 → 被替换且可见标记；
6. `重置全部筛选` → 各 Tab 回到作者默认值，标记消失；
7. 编辑模式不跑解析、不写值；
8. 单测：`categoryFiltersBoundValues.test.ts` + 既有 216+ 例全绿；`tsc --noEmit` 0 error。
