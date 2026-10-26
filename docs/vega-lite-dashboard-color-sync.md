# 自定义图表（Vega-Lite）跟随看板同步颜色

> 状态：设计中（实现中）
> 日期：2026-10
> 关联：[chart-color-sync-plan.md](./chart-color-sync-plan.md)、[chart-color-sync-optimization.md](./chart-color-sync-optimization.md)、[custom-viz-guide.md](./custom-viz-guide.md)

## 背景

客户诉求：

1. 看板里同时有系统图表（笛卡尔/饼图）和自定义图表（Vega-Lite）时，希望自定义图表也能用看板的颜色体系，**跨图表同名系列同色**。
2. 自定义图表当前没有颜色配置入口，颜色只能手写 spec JSON；用户不想为每张自定义图表各配一套颜色。

现状（CUSTOM 被**有意排除**）：

- `packages/frontend/src/providers/DashboardChartColorSync/useDashboardChartColorSync.ts`
  `shouldSyncColors = enabled && !isCustomChart && inSyncList` → 自定义图表强制不走同步。
- `packages/frontend/src/hooks/useChartColorConfig/colorSyncKeys.ts`
  `extractColorSyncKeysFromChartConfig` 只解析 `PIE` / `CARTESIAN` → 自定义图表的系列名不进看板色表。
- `packages/frontend/src/components/CustomVisualization/index.tsx`
  只做 `data: { name: 'values' }` 注入、字段名改写、尺寸归一化，**完全不碰颜色**；颜色 100% 来自 spec 里的 `scale`。

结论：看板「同步图表颜色」对自定义图表**无效**（但勾选列表里 CUSTOM 图会出现，勾了不生效，属 UX 坑）。

## 目标

看板开启「同步图表颜色」后，自定义图表**零配置**跟随看板调色板：

- 同一系列名在「自定义图表 ↔ 笛卡尔图 ↔ 饼图」之间、以及「多个自定义图表」之间颜色一致。
- 不需要用户改 spec、不需要新建配置项。
- 未开启同步时行为完全不变（自定义图表继续用自己的 spec 配色）。

非目标（本轮不做）：

- 不做自定义图表的编辑器级颜色面板（方案 C）。
- 不改自定义图表 spec 里的配色语义（2.1 维持现状：颜色仍可在 spec 里写死）。

## 方案：渲染期注入（方案 B）

### 1. 参与条件

`providers/DashboardChartColorSync/useDashboardChartTileColorSync.ts`

```
shouldSyncColors = resolvedEnabled && isTileInSyncList     // 去掉 !isCustomChart
```

- 沿用看板现有的「同步颜色的图表」勾选列表（`syncChartTileUuids`，严格白名单：为空 = 没有任何图表参与同步）。
- CUSTOM tile 本来就在 `pages/Dashboard.tsx` 的勾选列表里（`chartTiles` 只按 tile 类型过滤），改完后勾选才真正生效。
- 关闭同步时 `colorPalette` 仍取 `chart.colorPalette`（图表自身调色板），行为不变。

### 1.1 同步范围改成严格白名单

旧逻辑是「列表为空 = 全部 tile 同步」（`isTileInSyncList` 为空时返回 true），导致：

- 打开一个已开启同步的看板、还没勾选任何图表时，所有图表（含标准图和自定义图）就已经变色；
- 自定义图 spec 里自己写的配色也会被接管。

改成严格白名单：`isTileInSyncList = syncChartTileUuids.includes(tileUuid)`，
列表为空 → 没有任何图表参与同步 → 颜色完全不变。同理
`getSyncedSavedChartRefs` 在列表为空时返回空，色表也不会再去拉取所有图表的配置。

### 2. 取色来源（与标准图完全一致）

看板色表 `hashAssignments`（= known 哈希分配 + 看板级追加未知名），解析函数复用
`packages/frontend/src/hooks/useChartColorConfig/hashColorAssignment.ts`：

```ts
resolveSyncedHashColor(name, palette, hashAssignments)
```

- 键归一统一用 `toColorSyncKey`（`colorSyncKeys.ts`），与笛卡尔/饼图同一命名空间（原始值字符串）。
- 优先级与标准图一致：`hashAssignments` 命中 → 用命中色；未命中 → `getHashColor(name, palette)`（同名同色，稳定）。
- 说明：当前同步色表**不采用手配色**作为颜色来源（见 `useDashboardColorSyncMap.ts` 注释「manualColors：仅用于发现系列名，不再作为配色来源」），自定义图表沿用同一语义。

### 2.1 标准图的 known 色表键（影响自定义图能否对上颜色）

`extractColorSyncKeysFromChartConfig`（CARTESIAN）收集的系列名：

- 透视系列（`encode.yRef.pivotValues` 非空）→ 收透视值（渲染期 identifier 就是透视值）；
- 非透视系列（两个指标各一条）→ 收 `encode.yRef.field`，即指标字段名（渲染期 identifier 同为该字段名）。

第二条是后补的：之前非透视系列的指标名被排除在 known 键之外，只剩
`getHashColor(name, palette)` 纯哈希取色，没有共现避让 → 同图两个指标可能落到同一个色板槽位
（例如「上期销售额」「本期销售额」在 9 色默认色板上都命中 index 0 → 两条系列同色）。
指标名进色表后，它们变成同图共现关系，`assignKnownHashColors` 的避让规则生效 → 不同色，
且同名指标在别的图里也是同一个颜色。

### 3. 注入点

`packages/frontend/src/components/CustomVisualization/index.tsx`

注入发生在 `prepareSpecForVega()` 之后（此时 `encoding.*.field` 已是 fieldId，与 `series` 的列名一致）、
`normalizeVegaSpecSizing()` 之后，写入最终传给 `<VegaLite spec={...}>` 的对象。

### 4. 注入规则

| 情况 | 行为 |
|---|---|
| `encoding.color` 有 `field` 且 `type` 为 `nominal` / `ordinal` | 注入 `scale.domain` + `scale.range` |
| `encoding.color.scale.range` 用户显式写了数组 | **覆盖**（开启同步并选中该图时由看板色板接管配色）；覆盖前后的颜色对应关系会用于重映射 spec 里的常量色 |
| `encoding.color.scale` 为 `null` | 跳过（字段值本身就是颜色，如 `'#3CB976'`） |
| `encoding.color.scale.scheme` 存在 | 覆盖（删 `scheme`，改成 domain+range）；看板调色板比 scheme 更具体 |
| `encoding.color` 是 `condition` 条件编码 | 跳过 |
| `encoding.color.type` 是 `quantitative` / `temporal` | 跳过（连续色阶，语义不同） |
| `encoding.color.scale.domain` 是显式数组 | **直接当作系列集合**（不依赖数据），顺序 = 用户给的顺序；此时忽略 `color.sort`（vega-lite 显式 domain 不排序） |
| `field` 在 `series` 里不存在（transform 计算列）且没有显式 domain | 跳过（domain 取不到值） |
| spec 顶层 + 任意层 `layer`（含嵌套 layer） | 逐个处理 |

domain 取值有两种来源：

1. **用户显式写了 `scale.domain` 数组** → 直接用该数组作为系列集合。
   这解决了「fold / calculate 产生的计算列」（如 `year_label = 本期销售额 / 上期销售额`）
   不在原始数据行里、无法从数据推导 domain 的问题；此时 `color.sort` 被忽略。
2. **否则从 `series` 里该字段的去重值推导**，**保持原始值类型**（数值仍是数值，否则 vega 匹配不到数据），
   顺序 = 首次出现顺序；再按 `color.sort` 语义排序。

range = `domain.map(v => v === null ? '#cccccc' : resolveColor(String(v)))`。

### 4.1 常量色重映射（“开启同步即自动接管配色”）

自定义图表常用手写色块做图例（`encoding.color.value: '#4169E1'`），这类常量色不经过 color scale，
默认不会跟随看板色板。实现上会：

1. 覆盖 `scale.range` 时记录「旧 range[i] → 新 range[i]」的位置对应关系；
2. 再遍历一遍 spec，把 `encoding.color.value` / `mark.color` 里**与旧 range 字面完全相同**的颜色
   换成新颜色（同一旧色对应多个新色时视为语义不明，不重映射）。

这样「开启同步 + 选中该图」后，柱子的颜色和手绘图例色块会一起跟随看板色板，用户无需修改 spec。

### 5. 未知系列名注册

自定义图表的系列名在保存配置里不可知（spec 只有字段名），因此靠运行时注册：

- 注入时把本次 domain 的值（`String(v)`）收集为 `visibleKeys`；
- 通过 `registerVisibleColorKeys` 交给看板级 Provider（与笛卡尔图同一条路径，
  `hooks/useChartColorConfig/hashColorAssignment.ts:appendDashboardUnknownHashColors`），
  未知名会按「避开全看板已占色」分配，并**全看板稳定**；
- 首帧可能有一次重渲染（注册后颜色更新），与现有笛卡尔图行为一致。

## 模块与 API 契约

### 新增：`packages/frontend/src/components/CustomVisualization/vegaColorSync.ts`（纯函数，可单测）

```ts
export type VegaSeriesRow = Record<string, unknown>;

/** 收集 spec 中需要注入的 color 编码位置（顶层 + layer/复合视图递归），返回 spec 内的路径数组 */
export const collectCategoricalColorPaths = (
    spec: Record<string, unknown>,
): Array<Array<string | number>>;

/** 取某字段在数据中的去重值，保持原始类型，首次出现顺序 */
export const extractDomainValues = (
    series: VegaSeriesRow[],
    field: string,
): unknown[];

/**
 * 按颜色映射改写 spec。
 * @returns 改写后的 spec（不改原对象）与本次可见系列名
 */
export const applyDashboardColorSync = ({
    spec,
    series,
    resolveColor,
}: {
    spec: Record<string, unknown>;
    series: VegaSeriesRow[];
    resolveColor: (value: string, field: string) => string;
}): { spec: Record<string, unknown>; visibleKeys: string[] };
```

### 新增：`packages/frontend/src/components/CustomVisualization/vegaColorResolver.ts`（纯函数，可单测）

```ts
/** 字段 + raw 值 → 展示值（用于颜色键兜底匹配） */
export const buildFormattedValueMap = (
    rows: ResultRow[] | undefined,
): Map<string, string>;

/** 生成「系列值 + 字段 → 颜色」的解析函数 */
export const createVegaColorResolver = ({
    palette,
    hashAssignments,
    knownHashAssignments,
    formattedValueMap,
}: {
    palette: string[];
    hashAssignments: Record<string, string>;
    /** known 系列（看板已保存配置里出现过的维度值）的颜色 */
    knownHashAssignments?: Record<string, string>;
    formattedValueMap?: Map<string, string>;
}): (value: string, field: string) => string;
```

取色顺序：**known raw → known 展示值 → 运行时追加 raw → 运行时追加展示值 → 哈希兜底**。

原因：标准图的颜色键不统一——笛卡尔图用 pivot 的原始值，饼图用分组名（展示值）；而自定义图表的 `series` 里只有 raw 值。展示值兜底让「同一维度值」在标准图与自定义图之间落到同一个颜色（例如日期维度）。同时优先用 known（看板已保存配置里出现过的维度值）色，避免被运行时追加的「避开全看板已占色」规则带偏。

约束：

- 纯函数，不引入 React / 组件依赖；不改原 spec（返回新对象）。
- `resolveColor` 由调用方注入（便于单测与解耦）。
- 找不到可注入的 color 编码时，原样返回 spec。

### 接线改动

| 文件 | 改动 |
|---|---|
| `packages/frontend/src/components/LightdashVisualization/context.ts` | `VisualizationContext` 增加 `colorSync: { enabled: boolean; palette: string[]; knownHashAssignments: Record<string, string>; hashAssignments: Record<string, string>; registerVisibleColorKeys: (keys: string[]) => void }` |
| `packages/frontend/src/components/LightdashVisualization/VisualizationProvider.tsx` | 组装 `colorSync`（`enabled = useHashBased`，`palette = colorPalette`，`hashAssignments`，`registerVisibleColorKeys` 来自 `useRegisterDashboardVisibleColorKeys()`）并放进 context value |
| `packages/frontend/src/providers/DashboardChartColorSync/useDashboardChartColorSync.ts` | `shouldSyncColors` 去掉 `!isCustomChart` |
| `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` | 跟随上面的语义变化（`isCustomChart` 不再用于排除） |
| `packages/frontend/src/components/CustomVisualization/index.tsx` | 应用 `applyDashboardColorSync`（颜色由 `createVegaColorResolver` 解析）；把 `visibleKeys` 交给 `VisibleColorKeysRegistrar` 注册到看板色表；spec 派生管线与颜色同步结果均用 `useMemo` 缓存（避免每次渲染重建 spec / 重复扫描数据） |
| `packages/frontend/src/components/CustomVisualization/VisibleColorKeysRegistrar.tsx` | 新增：子组件 + `useLayoutEffect` 注册可见系列名（渲染期不写 ref / 不 setState；用内容签名去重；看板色表重置后 `registerVisibleColorKeys` 引用变化 → 自动重新注册） |

### 附带改动：「同步颜色的图表」列表标注图表类型

自定义图表参与同步后，同一个列表里既有标准图也有自定义图，两者的取色语义仍不同（标准图有手配色/元数据色等更多来源，自定义图只有 spec 里的 color 编码）。因此在看板编辑态的「同步颜色的图表」配置弹层里，每条图表名后追加灰色类型标注，例如 `销售额趋势（图表）`、`品牌占比（饼图）`、`自定义折线（自定义图表）`、`SQL 汇总（SQL 图表）`。

| 文件 | 改动 |
|---|---|
| `packages/frontend/src/hooks/useChartColorConfig/useDashboardChartTypeMap.ts` | 新增：按 tile 拉 `['saved_query', uuid]`（与图表 tile 共用缓存）得到 `tileUuid → ChartType`，只读不参与配色 |
| `packages/frontend/src/pages/Dashboard.tsx` | 颜色配置弹层改为受控（`colorConfigOpened`），展开时才拉图表类型；`Switch` 的 `label` 换成节点，追加 `c="dimmed"` 的类型后缀 |
| `packages/frontend/public/locales/{zh,en}/translation.json` | 新增 `dashboard.sync_chart_colors_types.*` |

## 边界与已知限制

1. spec 显式写了 `encoding.color.scale.range` 的自定义图表**会被覆盖**（开启同步并选中该图时）→ 不想被接管就不要把该图放进「同步颜色的图表」列表。
2. 条件编码（`condition`）、连续色阶（quantitative color）不处理。
3. transform 计算列做 color 时无法注入 —— **除非**用户显式写了 `encoding.color.scale.domain` 数组，
   此时该数组被当作系列集合（典型场景：宽表 + `fold` + `calculate` 生成的 `year_label`）。
4. domain 由数据推导：被 filter 掉的系列可能仍出现在 legend（轻微）。
5. 同一张自定义图表里多个 color 编码（多层）会各自注入，可能出现同名字段重复解析（幂等）。
6. 未开启看板同步时，本改动对自定义图表零影响。
7. 注入的是显式 `domain` + `range`，会覆盖 Vega-Lite 默认的 domain 归一/去重。domain 顺序与 vega-lite 6.4.3 的 `parseSortForDomain` 对齐：

   - 未写 `sort` → 按值升序（数字按数值、字符串按字典序）；
   - `sort: true` → 数据出现顺序（vega-lite 对 boolean sort 不生成 domain sort）；
   - `sort: false` → 数据出现顺序；
   - `sort: 'ascending'` / `'descending'` → 按 color 字段自身升序 / 降序；
   - `sort: '-y'` / `'y'` → 按对应通道字段的聚合值排序（`aggregate` 优先；未写时 quantitative 堆叠度量用 `sum`、其余用 `min`）；
   - `sort: {field, op?, order?}` → `op` 缺省时堆叠度量用 `sum`、其余用 `min`；
   - `sort: {encoding, order?}` → 用该通道的 `aggregate`；
   - `sort` 无法解析时（如只写 `{op, order}` 没有字段）→ 跳过注入，不改用户 spec。
8. 开启同步时 `scale.scheme` 会被移除（改为显式 `range`），属于用户 spec 的改写。
9. 颜色变化会触发 `react-vega` 重建 view（spec 变化属于昂贵变更），大数据量图表上会短暂卡顿；`react-vega` 用 `fast-deep-equal` 比较 spec，内容不变不会重建。
10. 自定义图表的颜色键与标准图不是同一命名空间：标准图进 `knownColorKeys`（共现避让规则），自定义图表运行时注册（避开全看板已占色）。同名系列多数能对上（笛卡尔 pivot 值与自定义图 raw 值一致）；当 raw 与展示值不一致时，靠展示值兜底匹配到标准图的颜色（仅限该展示值已在 known 里）。
11. 数值 `1` 与字符串 `'1'` 在颜色键上会折叠为同一个 key（与标准图行为一致），但 Vega 侧视为两个值 → 可能两值同色。
12. 注入覆盖顶层、`layer`、`hconcat`/`vconcat`/`concat`、`facet.spec`/`repeat.spec`；更深的嵌套组合不支持。
13. 数据里存在 null 分类时，null 会进 domain 并配一个中性灰 `#cccccc`（Vega-Lite 默认也会给 null 上色，但用的是色表第一个颜色；本实现固定用中性灰以保证跨图稳定）；null 不占用看板色表槽位。
14. `visibleKeys`（注册到看板色表的名字）始终按数据首次出现顺序，与 domain 顺序解耦；看板色表重置后会自动重新注册。
15. `encoding.color.scale: null` 的编码不注入（字段值本身就是颜色，如 `'#3CB976'`）。
16. 显式 `scale.domain` 时忽略 `color.sort`（vega-lite 显式 domain 不排序），且 domain 里没列出的分类不会被上色。

## 验证

1. 单测 `vegaColorSync.test.ts`：顶层/layer/复合视图注入、显式 range 被覆盖、覆盖后常量色重映射（`encoding.color.value` / `mark.color`）、scheme 被替换、condition/quantitative 跳过、计算列跳过（无显式 domain 时）、显式 domain 作为系列集合（计算列也能注入）、显式 domain 时忽略 sort、`scale: null` 跳过、显式 domain 内的 null 配中性灰、domain 保序与类型保持、空数据不注入、`color.sort` 各形态排序（含 `sort: true` / `false` / `ascending` / `descending` / 字段与通道两种对象写法、堆叠 sum 与非堆叠 min）与无法解析时跳过、null 分类配中性灰。
2. 单测 `vegaColorResolver.test.ts`：raw 键优先、展示值兜底、known 优先于运行时追加、跨字段不误命中、哈希兜底确定性。
3. 单测 `VisibleColorKeysRegistrar.test.tsx`：启用/禁用、keys 为空不注册、内容不变不重复注册、注册回调变化时重新注册。
2. 手工：本地起 dev server，建一个看板（1 张透视柱图 + 1 张自定义折线图，同一个维度值），开启同步 → 两图同名系列同色；关闭同步 → 自定义图回到自身配色。
3. 回归：未开启同步的看板，CUSTOM 图渲染无变化；导出图片与页面一致。
