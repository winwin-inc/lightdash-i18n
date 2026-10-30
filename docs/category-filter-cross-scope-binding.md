# 看板类目筛选器：跨作用域级联（全局 ⇄ Tab）

> 关联文档：[类目筛选器联动](./category-filter-cascade.md)（单作用域联动的既有语义）
>
> 分支：`feat/tab-filter-category-binding`

## 一、背景与目标

原有类目联动只在**同一个作用域内**生效：

- 全局筛选器之间：全局一级 → 全局二级
- Tab 筛选器之间：Tab 一级 → Tab 二级 → Tab 三级 → Tab 四级

缺失的能力：

1. 全局筛选器无法继续驱动各 Tab 的三级、四级筛选器（全局二级 → Tab 三级 → Tab 四级）
2. 全局与 Tab 出现**同名字段**时无法区分父子关系（只靠 `parentFieldId` 无法定位父级到底在哪个作用域）
3. 父级**中间层缺值**时，下级仍保留旧值 → 查询结果为空（"一级和三级有值、二级没值"）

本特性在保留旧数据兼容的前提下补齐以上能力。

## 二、数据模型

`DashboardFilterRule`（`packages/common/src/types/filter.ts`）新增两个字段，与既有 `parentFieldId` 组合使用：

| 字段            | 类型                | 含义                                                                     |
| --------------- | ------------------- | ------------------------------------------------------------------------ |
| `parentFieldId` | `string`（既有）    | 父级筛选器的**字段 id**（跨作用域绑定时仍指向父级字段）                  |
| `parentScope`   | `'global' \| 'tab'` | 父级所在**作用域**：`global` = 全局筛选器；`tab` = 某个 Tab 的筛选器     |
| `parentTabUuid` | `string`            | 父级所在的 **Tab uuid**（`parentScope === 'tab'` 时有效，缺省=同一 Tab） |

存储位置：

- 全局筛选器 → `dashboard_versions.filters`（JSONB，原样透传）
- Tab 筛选器 → `dashboard_tabs.filters`（JSONB，原样透传）
- Dashboard as-code → `packages/common/src/schemas/json/dashboard-as-code-1.0.json` 已包含新字段

## 三、作用域模型

```
作用域（scope）
├── global：全局筛选器（对所有 Tab 生效）
└── tab：某个 Tab 的筛选器（tabUuid 唯一标识）
```

### 3.1 作用域的「链」（chain）

级联计算统一基于**链**：

```
chain(某个 Tab) = [全局筛选器..., 该 Tab 的筛选器...]
```

- 全局永远排在前面：全局条件对所有 Tab 生效，且是「左侧条件」
- Tab 内保持自身顺序
- 父级查找、`field/search` 的左侧条件、签名计算都基于同一条链

对应实现：`buildCategoryChain({ globalFilters, tabFilters }, tabUuid)`。

### 3.2 父级解析规则（`findParentCategoryEntry`）

1. **显式作用域**（`parentScope` 存在）→ 精确匹配
   - `parentScope === 'global'` → 只在全局筛选器里找
   - `parentScope === 'tab'` → 在 `parentTabUuid` 指定的 Tab 里找（缺省=当前 Tab）
   - 找不到 → **绑定失效**（视为无父级）
2. **旧数据**（只有 `parentFieldId`）→ 兼容规则：**同作用域优先，其次全局**
3. 候选必须满足：不是自身、字段 id 相同、**父级层级严格低于子级**（避免成环）

### 3.3 父级候选（配置界面）

| 当前筛选器作用域 | 可选父级                                                   |
| ---------------- | ---------------------------------------------------------- |
| global           | 仅全局筛选器（全局值对所有 Tab 生效，不能依赖 Tab 筛选器） |
| tab              | 全局筛选器 + 同一 Tab 的筛选器                             |

- 排除自身、排除同字段、排除层级不低于自己的候选
- 候选项展示：`字段名 • 层级 • 作用域`（作用域文案：`全局` / `当前 Tab`）

## 四、配置交互

### 4.1 单个筛选器配置（`FilterConfiguration` / `FilterSettings`）

1. 选择「类目层级」（一级 ~ 四级）
2. 切换层级时**自动选择上一级父级**：同作用域优先 → 其次全局 → 其次第一个候选
3. 也可手动在「父级筛选器」下拉里选择/清除（复合键 `global:<fieldId>` / `tab:<tabUuid>:<fieldId>`，见 `common/parentFilterRef.ts`）
4. 清除父级时 `parentFieldId` / `parentScope` / `parentTabUuid` 三个字段一起清掉

### 4.2 批量绑定（`BatchBindModal`）

用于一次性补齐 / 修复类目筛选器的父级关系（只在编辑模式出现）。入口有两个：

- **全局筛选器行**：只写全局筛选器，父级候选也只能是全局筛选器（全局值对所有 Tab 生效，不能依赖某个 Tab）
- **Tab 筛选器行**：只写当前 Tab，父级可以是当前 Tab 或全局

全局批量绑定会一并补写全局筛选器的 `categoryLevel`（只认显式层级或 `cls_N` 列名，
**不用 label 文案兜底**，避免把普通筛选器误判成类目筛选器而影响所有 Tab）。

**层级识别**（`getBindableCategoryLevel`，`utils/categoryLevel.ts` + `common/batchCategoryBinding.ts`）：

1. 显式 `categoryLevel`
2. `cls_1..cls_4` / `cls1..cls4` 列名推导（跨 mart 同一套类目列；与跨 Tab 继承一致；
   级联运行时仍只认显式 `categoryLevel`，因此全局父级必须显式设置层级）
3. label 文案兜底：`一级类目`… 或 `Level N Category`（**只有批量绑定用**；
   批量绑定会把推导出的层级写回 `categoryLevel`，运行时不再依赖文案）

**父级选择规则**（`buildBatchCategoryBindingPlan`）：

1. 精确层级优先：先找「上一级」（n-1）
2. 同一层级内：**当前 Tab 优先 → 其次全局**（全局二级 → Tab 三级）
3. 上一级在整个候选范围都不存在时，向下找**最近的更低层级**
   （典型：一级类目只配在全局；或某个 Tab 只配了三级 / 四级）
4. 已有绑定与新规则指向同一父级时不重写（旧数据无 `parentScope` 也视为同一父级）；
   指向别的父级时按上述优先级**重算**（批量绑定是显式操作，不保留非最优绑定）
5. 一级类目不允许有父级：遗留的父级绑定会被清除
6. 候选范围里找不到任何更低层级：**保持原绑定**并提示「找不到可用上级类目」，
   不静默清空（父级可能在别的 Tab / 配置尚未加载）
7. 同层级同作用域有多个候选：先取作者已绑定的候选 → 再取与子级同一张表的候选
   → 最后按配置顺序；仍有多个候选时提示作者确认。
   与运行时一致：只排除同一条规则，允许「同字段不同规则」的父子绑定
8. 全局候选必须已显式设置 `categoryLevel`：运行时 `isCategoryField` 只认显式层级，
   而批量绑定无法修改全局筛选器；绑定到「仅靠 cls 列名推导」的全局父级会让
   运行时父子链路断裂（子级被清空）
9. 选中子级时，其 **祖先链**的 `categoryLevel` 会被一并写入（即使祖先未勾选、
   或子级本来就已经绑定正确）：
   Tab 祖先可以由批量绑定自己补层级，但运行时要认它是类目筛选器，否则链路仍会断。
   祖先未被选中时沿它**实际存储的父级绑定**继续向上补层级（不按重算后的绑定）

**预览与写回（编辑模式 = 构建绑定关系，不做查看模式的过滤语义）**：

- 列出**全部**识别到的类目筛选器（按层级 1→4 排序），并**默认全部勾选**：
  作者只需取消不想改的条目，不需要「已绑定 / 无父级」之类的禁用态
- 父级建议只按类目名称 / 层级生成，**与父级是否已选值、是否启用无关**
- 已正确绑定的行显示「父级筛选器：xxx（已绑定）」；没有更低层级时显示
  「已是当前最高层级，无需绑定父级」（不报错）
- 只有两种情况给橙色提示：① 存在更低层级筛选器但它没有显式 `categoryLevel`；
  ② 原父级已失效且没有可用候选（保持原绑定）
- 勾选了但没有实际变化的行不会产生写入（应用只写 `categoryLevel` / 父级四字段）
- 变更预览里的父级标签解析 `当前 Tab + 全局` 两侧，并带作用域（`全局` / `当前 Tab`）
- 勾选后才写入父级；未勾选 / 无变化的筛选器保持原对象引用（上层只对变化的规则做写回）
- 例外：选中的子级依赖的 Tab 祖先层级会被一并补写（祖先不勾选也会写 `categoryLevel`；
  UI 会把该行显示为选中 + 禁用并给出说明）
- 写回字段：`categoryLevel` + `parentFieldId` + `parentScope` + `parentTabUuid`（四个字段同写同清）

### 4.3 作用域的传递

- `DashboardFilter` 组件已带 `filterScope: 'global' | 'tab'`
- `FilterConfiguration` 据此决定候选来源，并把 `filterScope` 传给 `FilterSettings`（决定自动选父级时的优先级）
- `BatchBindModal` 额外接收 `globalFilters` 与 `tabUuid`

## 五、运行时流程

### 5.1 首次加载（初始化）

```mermaid
flowchart TD
    A[看板加载] --> B{有类目筛选器?}
    B -->|否| Z[不等待解析]
    B -->|是| C[runGlobalCategoryInit<br/>解析全局一级→二级]
    C --> D[isGlobalCategoryResolutionPending = true]
    D --> E{切换到某个 Tab?}
    E -->|是| F[runTabCategoryInit<br/>chain = 全局 + 该 Tab]
    F --> G{全局解析完成?}
    G -->|否| F
    G -->|是| H[按层级 1→4 逐级解析]
    H --> I{该级是类目筛选器<br/>且未禁用?}
    I -->|否| I2[跳过<br/>被禁用且无值→清空其后代]
    I -->|是| J[field/search<br/>条件=左侧已选 + 父级值 + dashboardSlug]
    J --> K{结果}
    K -->|当前值在结果中| L[保留当前值]
    K -->|当前值不在结果中| M[切换为第一个结果]
    K -->|结果为空| N[保留原值<br/>无法区分表里没有/行级过滤]
    K -->|请求失败| N
    L --> O[继续下一层级]
    M --> O
    N --> O
    O --> P[解析完成: pending = false<br/>图表按最终类目查询]
```

> Tab 初始化必须**等全局解析完成**：全局父级还没定值时解析 Tab，会把 Tab 三级误判为「父级无值」而清空。

### 5.2 用户改值（级联）

```mermaid
flowchart TD
    A{用户选择类目值} --> B{作用域}
    B -->|全局| C[updateGlobalCascadeWithFieldSearch]
    B -->|Tab| D[updateTabCascadeWithFieldSearch]
    C --> E[updateCrossScopeCategoryCascadeAsync<br/>链 = 全局 + 各 Tab]
    D --> F[updateCategoryFilterCascadeAsync<br/>链 = 全局 + 当前 Tab]
    E --> G[逐个作用域: 全局 → 各 Tab]
    F --> G
    G --> H[找出直接子级<br/>findParentCategoryEntry]
    H --> I{子级有确认选中的值?}
    I -->|否| I1[清空其所有后代]
    I -->|是| J[field/search<br/>父级用新值作为 override]
    J --> K{结果}
    K -->|当前值有效| L[保留]
    K -->|当前值无效| M[切换为第一个]
    K -->|为空/失败| N[保留原值]
    K -->|父级无值| O[清空该级 + 所有后代]
    L --> P[继续向下级联]
    M --> P
    N --> P
    O --> P
    P --> Q[写回对应作用域]
```

### 5.3 断链清空（关键修复）

**场景**：一级有值、二级无值、三级有值 → 三级必须被清空，否则查询带着失效的三级值，结果为空。

判定点在 `resolveCategoryFilterValueAsync`：

- 配了父级、但父级在链上**没有值** → `status: 'clear'` → 清空当前级，并递归清空所有后代
- 父级**绑定失效**（显式作用域找不到对应筛选器）→ 同样按断链处理

与「空候选保留原值」的区别：

| 情况                                      | 处理            | 理由                                       |
| ----------------------------------------- | --------------- | ------------------------------------------ |
| 父级**没有值**（断链）                    | 清空当前级+后代 | 值必然无效，带着查必然空结果               |
| `field/search` 返回**空候选**（父级有值） | 保留原值        | 无法区分「表里没有」与「行级过滤全过滤掉」 |
| `field/search` **请求失败**               | 保留原值        | 无法判断，不改变用户筛选语义               |

## 六、并发、generation 与 pending

- **init 与 cascade 使用独立 generation**：自动初始化不会作废用户刚做的选择
- 手动改动会作废在途的 init（`++initGeneration`）与更早的 cascade
- `skipFilterIds`：联动后的初始化跳过用户刚改的那一级 → 用户的显式选择优先
- **Tab 签名必须覆盖全局祖先**：`getTabCategoryChainSignature` = 全局 + 该 Tab 的链签名；
  全局二级变化 → 签名变化 → Tab 重新解析
- pending 状态：`isGlobalCategoryResolutionPending`（全局）、`pendingTabCategoryResolutions`（各 Tab）
  - 解析完成前图表不发起查询，避免"先出一版未解析的数据再刷新"
  - 等待上限 10s，超时先放行图表，解析完成后再校正一次

## 七、旧数据兼容

| 旧数据                                 | 解析结果                  |
| -------------------------------------- | ------------------------- |
| 只有 `parentFieldId`                   | 同作用域优先，其次全局    |
| `parentScope='global'`                 | 精确匹配全局筛选器        |
| `parentScope='tab'` + `parentTabUuid`  | 精确匹配指定 Tab 的筛选器 |
| `parentScope='tab'` 无 `parentTabUuid` | 视为同一 Tab              |

- `parentScope` / `parentTabUuid` 已进入 Dashboard as-code schema、TSOA 生成的 swagger/routes、筛选器操作日志（`parent_binding` 变更）
- URL/嵌入的 saved filter override 合并时保留 `categoryLevel` / `parentFieldId` / `parentScope` / `parentTabUuid`

## 八、关键代码

| 位置                                                                              | 职责                                                |
| --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `packages/common/src/types/filter.ts`                                             | `parentScope` / `parentTabUuid` 类型定义            |
| `packages/frontend/src/utils/categoryFilters.ts`                                  | 链模型、作用域解析、初始化与跨作用域级联、断链清空  |
| `packages/frontend/src/utils/categoryLevel.ts`                                    | 类目层级推导（显式 → 列名），跨 Tab 继承 / 批量共用 |
| `packages/frontend/src/utils/categoryFilterInitHelpers.ts`                        | Tab 初始化决策、跨作用域签名、乐观展示态            |
| `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx`                 | 全局/Tab 两条级联流程、generation、pending          |
| `packages/frontend/src/components/DashboardFilter/common/parentFilterRef.ts`      | 父级引用的复合键编解码                              |
| `packages/frontend/src/components/DashboardFilter/common/batchCategoryBinding.ts` | 批量绑定计划（层级推导 + 父级选择 + 应用）          |
| `packages/frontend/src/components/DashboardFilter/FilterConfiguration/*`          | 父级候选与配置 UI                                   |
| `packages/frontend/src/components/DashboardFilter/BatchBindModal.tsx`             | 批量绑定的预览 / 勾选 / 应用                        |
| `packages/frontend/src/hooks/dashboard/dashboardOperationEventQueue.ts`           | 绑定变更（含作用域）的操作日志                      |

主要函数：

- `buildCategoryChain` / `buildCategoryChainFromFilters` / `getCategoryChainFilters`
- `findParentCategoryEntry`（显式作用域精确匹配、旧数据兼容、层级校验）
- `initializeCategoryFiltersAsync`（支持 `scope.chain`）
- `updateCategoryFilterCascadeAsync`（支持 `scope.chain`）
- `updateCrossScopeCategoryCascadeAsync`（全局变更 → 各 Tab 传播）
- `getCategoryFiltersSignature`（含 `parentScope` / `parentTabUuid`）

## 九、验证清单

1. 全局一级 → 全局二级：切换一级，二级跟着变
2. 全局二级 → Tab 三级：Tab 三级绑定全局二级后，切换全局二级，Tab 三级跟着变
3. 全局二级 → Tab 三级 → Tab 四级：逐级联动
4. Tab 内一级 → 二级 → 三级 → 四级：逐级联动
5. 一级有值、二级无值、三级有值：三级被清空（不再带着失效值查询）
6. 全局与 Tab 同名字段：显式绑定后各自独立生效，互不串扰
7. 全局筛选器不能绑定 Tab 筛选器（候选里只有全局）
8. 旧看板（只有 `parentFieldId`）：仍按「同作用域优先，其次全局」联动
9. 用户显式选择不被随后的自动初始化覆盖
10. 临时筛选器（交叉筛选）不参与类目级联、不写回永久配置
11. 跨作用域绑定随看板保存 / 重新加载后仍然生效（as-code 往返保留新字段）
12. 批量绑定：Tab 只有二级 / 三级、一级只配在全局（且全局一级已显式设置类目层级）
    → 二级绑全局一级，三级绑 Tab 二级
13. 批量绑定：上一级缺失（例如只有三级）→ 三级绑到更低层级里最近的候选；
    完全没有更低层级 → 提示「找不到可用上级类目」，原绑定不被清空
14. 批量绑定：已有绑定会被重算到「上一级优先 / 当前 Tab 优先」的父级；
    旧数据只有 `parentFieldId` 且指向同一字段时不重写；一级类目的遗留父级被清除
15. 批量绑定：未勾选的筛选器不写回；应用后父级标签同时显示作用域（全局 / 当前 Tab）
16. 批量绑定：全局父级只有 cls 列名、没有显式类目层级 → 不当父级（避免运行时链路断），
    界面提示「存在更低层级筛选器但缺少类目层级」；选中子级时，依赖的 Tab 祖先层级
    会被一并补写（沿其实际存储的父级链），且该行不能被取消勾选
17. 批量绑定：同层级有多个候选 → 保持作者已绑定的那个；没有绑定时优先同表候选
18. 批量绑定：三级 / 四级已正确绑定也要列出并显示「已绑定」；所有行默认可勾选
    （编辑模式不按查看模式做禁用）；只有二级（没有一级）时显示
    「已是当前最高层级，无需绑定父级」，不报错
19. 全局行批量绑定：全局一级 / 二级只有 `cls_1` / `cls_2` 列名时，应用后补写
    `categoryLevel` 且二级绑一级；父级只会是全局筛选器
20. 已绑定但父级缺显式层级：勾选子级应用后，父级 `categoryLevel` 被补写；
    筛选器配置弹窗的「父级筛选器」能正常显示（不再显示为空）
