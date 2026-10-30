# 表格列宽可拖拽调整方案（编辑模式可调 / 查看模式固定）

> 状态：**方案定稿，待开发**（本文档先于代码）。
> 触发问题：列数较多时部分列的表头（列名）折行，观感差；希望按实际字段内容左右拉伸列宽。
> 已确认的产品决策：**列宽在「编辑模式」调整并随图表保存，查看模式（看板 / view mode / embed / minimal）宽度固定、不可拖。**
> 参考实现：上游 Lightdash 官方 [`PR #20359 feat: add column width customization to tables`](https://github.com/lightdash/lightdash/pull/20359)（已随 `0.2615.0` 发布，官方文档 <https://docs.lightdash.com/visualizations/table> 的 "Resize columns" 一节）。上游明确写了 *"Intentionally removes this column resize feature from dashboards or view mode"*，与本仓库产品决策一致。

---

## 0. 范围

| 项 | 本期 | 说明 |
|---|---|---|
| 平表（`common/Table`）列宽拖拽 + 持久化 | ✅ P0 | 移植上游 PR，且顺带修掉「表头折行」 |
| 透视表（`PivotTableVTable`，Canvas/VTable）列宽拖拽 + 持久化 | ✅ P1 | 本仓库透视表已换成 VTable，**不能**照搬上游 DOM 方案，需用 VTable 的 `columnWidthConfig` |
| 列配置面板显示 px + 重置 | ✅ P1.5 | 对齐上游「pixel label + reset button」 |
| 看板 / 看板编辑模式 / Embed / Minimal / AI 里拖拽 | ❌ 非目标 | 与上游一致，且 `onChartConfigChange` 在看板本就未接线 |
| Explore 原始 Results 表、Underlying data 表、SQL Runner / Data app 表格 | ❌ 非目标 | 无 chart 配置持久化载体（SQL Runner 是另一套 `VizColumnConfig`），如需另开任务 |
| 触屏 / 键盘调整列宽 | ❌ 非目标 | 上游也仅支持鼠标；后续可加 Pointer Events + `aria-valuenow` |
| 逐透视叶子列精调（同一指标不同维度值各自不同宽） | ❌ v1 不做 | 见 §2.3「key 规则」的理由 |

---

## 1. 现状调研结论（含证据位置）

### 1.1 两套表格渲染，症状指向平表

| 渲染路径 | 何时使用 | 表头会不会折行 | 现状宽度逻辑 |
|---|---|---|---|
| **平表**：`SimpleTable` → `common/Table` → `TableProvider/ScrollableTable`（TanStack + HTML `<table>`） | 无透视维度时 | **会折行**：`Th` 没有 `white-space` 规则，默认 `max-width: 300px`，表格 `width: 100%` 被多列挤压时中文列名换行 → **本次问题的主因** | 仅 `meta.style.{width,minWidth,maxWidth}`；唯一显式宽度是 bar 列 160px（`hooks/tableVisualization/getDataAndColumns.tsx:160-166`） |
| **透视表**：`SimpleTable` → `PivotTableVTable`（VTable / Canvas） | 有透视维度时 | 不折行，超宽变省略号 + tooltip | `widthMode:'autoWidth'` + `limitMaxAutoWidth = pivotColumnMaxWidth ?? 450`（`PivotTableVTable/index.tsx:308-319`）；数据列 `minWidth 88 / maxWidth 450`、维度列 `minWidth 160`（`pivotDataToVTable.ts:66-73`）；`columnResizeMode:'none'` 明确禁用拖动（`PivotTableVTable/index.tsx:338`） |

> 旧 DOM 版 `common/PivotTable/` 目前**无生产引用**（仅 `getFrozenColumnLayout.ts` 被 VTable 版复用），因此上游 PR 里针对它的改动**不移植**。

### 1.2 宽度可持久化的既有载体

```
useTableConfig: columnProperties state            → hooks/tableVisualization/useTableConfig.ts:184
      ↓ updateColumnProperty(fieldId, partial)      → 同文件 :563
      ↓ validConfig.columns = columnProperties      → 同文件 :668
      ↓ onChartConfigChange                         → LightdashVisualization/VisualizationConfigTable.tsx:41-48
      ↓ 保存 chart version（chartConfig 是 JSON 列，无需 migration）
      ↓ 看板 / 查看模式读取同一份 config
```

结论：**只要给 `ColumnProperties` 加 `width`，持久化链路自动生效**，不需要新顶层字段、不需要 DB migration。

相关既有机制：
- dbt 字段重命名会按 key 重写 `columns`，宽度会跟着字段迁移：`packages/backend/src/services/RenameService/rename.ts:355`。
- chart-as-code JSON schema 由 swagger 生成：`packages/common/src/schemas/json/chart-as-code-1.0.json`，脚本 `pnpm -F common generate:chart-as-code-schema`（带 `--check`，过期会失败）。
- TSOA 生成物：`packages/backend/src/generated/{routes.ts,swagger.json}`，改 `ColumnProperties` 后必须 `pnpm generate-api`。

### 1.3 编辑模式开关现状

- Explorer 已有 `isEditMode`：`components/Explorer/VisualizationCard/VisualizationCard.tsx:114`（`useExplorerSelector(selectIsEditMode)`），但**没有往下传给 `VisualizationProvider` / `common/Table`**。
- `VisualizationProvider` 目前只有 `minimal` / `isDashboard`（`LightdashVisualization/VisualizationProvider.tsx:66-67`、`:496-497`；`context.ts`）。
- 看板永远不会传 `onChartConfigChange`（`DashboardTiles/DashboardChartTile.tsx`），因此看板内的表格配置本来就是只读的。

### 1.4 VTable（透视表）侧的关键源码事实（已核对 `@visactor/vtable@1.23.3`）

| 事实 | 证据 | 影响 |
|---|---|---|
| `widthMode:'autoWidth'` 下**列定义里的 `width` 被忽略** | `core/BaseTable.js` `getColWidthDefined()`：`if ('autoWidth' === this.widthMode) return 'auto'` | 不能靠给 colDef 写 `width` 来持久化 |
| 官方声明式入口是 `columnWidthConfig: { key, width }[]` | `ts-types/table-engine.d.ts`（ListTableProtected）；`scenegraph/layout/compute-col-width.js` `_parseColumnWidthConfigForListTable()` | 每次算宽都会重新套用，天然跨 `updateOption` 存活，且不覆盖「本次会话刚拖过」的列 |
| 它按**叶列 `define.key`** 匹配，而本仓库只写了 `field` | `layout/simple-header-layout.js` `getColumnByKey()` 比对 `columnData.define.key`；`ts-types/list-table/define/basic-define.d.ts:33` 有 `key?: number \| string` | 需要在生成的叶列上补 `key` |
| `updateOption(option)`（单参）会 `clearColWidthCache` → 清掉手动宽度 | `core/BaseTable.js` `updateOption()`：`_widthResizedColMap.clear()` + 重建 `colWidthsMap`；`ListTable.js:320-357` | 当前任何配置变化都会把用户拖过的宽度重置（现在因为 `columnResizeMode:'none'` 未暴露） |
| resize 事件：拖动中 `RESIZE_COLUMN {col, colWidth}`，抬手 `RESIZE_COLUMN_END {col, colWidths[]}`；双击边界自适应也复用 `RESIZE_COLUMN_END` | `event/listener/table-group.js` `endResizeCol()`；`core/TABLE_EVENT_TYPE.js` | **只落库用户实际拖动的 `col`**，不要把整个 `colWidths` 当配置存 |
| 拖动/回填宽度都会被夹到列的 `[minWidth, maxWidth]` | `core/BaseTable.js` `_adjustColWidth()` + `setMinMaxLimitWidth()` | 若显式宽度 > 现有 `maxWidth(450)`，会出现「存 600 → 渲染 450」 |
| `autoFillWidth`（本仓库 `pivotAutoFillWidth`「铺满剩余空间」）按 `factor` **等比缩放所有列**，不区分手动宽度 | `compute-col-width.js` `getAdaptiveWidth()` | 与「像素级持久化」冲突，需互斥 |
| 合并表头（分组列）不能发起拖动 | `_canResizeColumn()`：`isCellRangeEqual(col,row,col+1,row)` 时 return false | 只能拖**叶子列**右边界，符合预期 |
| 列级 `disableColumnResize` 存在 | `ListTable.js:305-315` | 可用于禁止序号列/占位列拖动 |

### 1.5 HTML `<table>` 布局实测（本机 Chrome 156，模拟本仓库 CSS）

| 场景 | 实测结果 |
|---|---|
| 列设 `width+minWidth+maxWidth = 150px`，长文本 | 150px ✅ |
| 只设 `width:150px`，长文本（默认 `max-width:300px`） | **300px**（被内容/min-content 撑开） |
| 列设 `min=max=100px`，容器 600px，3 列 | 各 **199px**（`width:100%` 下按比例拉伸） |
| 列设 `min=max=400px`，3 列，容器 600px | 表宽 1202px，横向滚动 ✅ |
| `table-layout: fixed` + 3×100px，容器 600px | 仍各 199px（fixed 也分配剩余空间） |

→ 实现约束：**(a)** 必须 `width/minWidth/maxWidth` 三者同写；**(b)** 「总宽 < 容器时按比例拉伸」是 HTML 表格固有行为，接受它（与上游一致），不为此改 `table-layout`。

---

## 2. 数据模型

### 2.1 字段

```ts
// packages/common/src/types/savedCharts.ts:162
export type ColumnProperties = {
    visible?: boolean;
    name?: string;
    frozen?: boolean;
    displayStyle?: 'text' | 'bar';
    width?: number; // px（整数）；undefined = 自动宽度
};
```

零 migration（`chartConfig` 为 JSON 存储）；`RenameService` 已按 key 重写 `columns`，字段重命名时宽度自动跟随。

### 2.2 约束

- `MIN_COLUMN_WIDTH = 50`（对齐上游）；`MAX_COLUMN_WIDTH = 1200`（可调，见 §8 待确认）。
- 落库前 `Math.round()`，并丢弃 `NaN/Infinity`。

### 2.3 宽度的 key 规则（关键决策）

```ts
// 行维度 / label 列 → 维度 fieldId；数据列 → 指标字段
const widthKey =
    col.columnType === 'indexValue' || col.columnType === 'label'
        ? col.fieldId
        : col.underlyingId ?? col.baseId;
```

理由（透视表）：叶子列 `fieldId` 是「表头拼接 + `colIndex`」（`packages/common/src/pivot/pivotQueryResults.ts:236-247`），行合计列更是 `row-total-{index}`（同文件 `:321`）——**随筛选/指标数量变化而错位，不能作为持久化键**。

语义结果：**列宽按「字段」生效，同一指标的多个透视列共用同一宽度**（例如「订单总额」在 12 个月下 12 列同宽）。这也是上游的选择（`PivotTable/index.tsx` 的 `widthKey` 规则完全相同）。

> 若后续产品要求「按维度值逐列精调」，需引入 `headerPath` 键空间（`TableChart.columnWidths?: Record<string, number>`），成本 +0.5~1 天，且会带来「筛选后键失效/漂移」问题 → 明确列为 v1 非目标。

---

## 3. P0：平表（移植上游 PR #20359）

### 3.1 门控（编辑模式才可拖）

```ts
// SimpleTable
const onColumnWidthChange =
    isEditMode === true && !isDashboard && !minimal
        ? (fieldId: string, width: number) =>
              updateColumnProperty(fieldId, { width: Math.round(width) })
        : undefined;
```

- 用严格 `=== true`，**不要**照抄上游的 `isEditMode === false`：本仓库 `MinimalSavedExplorer` / AI 可视化等未传该值（undefined），`!== false` 会误开手柄。
- 宽度渲染**不依赖**门控：查看模式照样按保存值出图，只是没有手柄。

### 3.2 文件级改动清单

| 文件 | 改动 |
|---|---|
| `packages/common/src/types/savedCharts.ts` | `ColumnProperties.width?: number`（§2.1） |
| `packages/frontend/src/components/common/Table/useColumnResize.ts` | **新增**（上游原样移植）：拖动期直接改 DOM（`th` + 同列 `td/th/tfoot` + `colgroup col`），`mouseup` 才回调一次；`mousedown` 需 `preventDefault + stopPropagation`；卸载时清理监听；`onColumnWidthChange` 用 ref 保最新值 |
| `packages/frontend/src/components/common/Table/ResizeHandle.module.css` | **新增**：6px 手柄，`position:absolute; right:0; cursor:col-resize; touch-action:none; z-index:2`，hover 变蓝 |
| `.../common/Table/ScrollableTable/TableHeader.tsx` | 在 `@hello-pangea/dnd` 的 `Draggable` **之外**渲染手柄（避免与表头拖拽换序冲突）；条件：`onColumnWidthChange && !minimal && header.id !== ROW_NUMBER_COLUMN_ID`；加 `role="separator"` + i18n `aria-label` + `data-testid` |
| `.../common/Table/Table.styles.ts` | `Th` 加 `position: relative`（`:328`）；`ThLabelContainer`（`:353`）改为 `overflow:hidden; min-width:0; flex:1; white-space:nowrap; text-overflow:ellipsis` → **顺带彻底修掉「列名折行」**；`ThActionsContainer`（`:355`）改 `flex-shrink:0` |
| `.../common/Table/TableProvider.tsx` | 冻列宽度动态化：`const defaultFrozenColumnWidth = 100`，`left` 按 `col.meta?.width ?? 100` 累加（现在硬编码，见 `:93-109`；不改会导致拖宽冻列后列重叠）；接收并透出 `onColumnWidthChange` |
| `.../common/Table/types.ts` | `ProviderProps.onColumnWidthChange?: (fieldId: string, width: number) => void` |
| `.../hooks/tableVisualization/getDataAndColumns.tsx` | 新增 `getColumnWidthMeta(width)` → `{ width, style: { width: 'Npx', minWidth: 'Npx', maxWidth: 'Npx' } }`；**放在 bar 160px 之后**（用户宽度优先）；统一用 `px` 字符串（`BodyCell` 的 props 是 `string`） |
| `.../hooks/tableVisualization/useTableConfig.ts` | 新增 `getColumnWidth(fieldId)`（`:184` 附近）并加入 `columns` 的 `useMemo` 依赖（`:352-390`） |
| `.../components/SimpleTable/index.tsx` | 计算 `onColumnWidthChange`（§3.1），传给 flat `<Table>`（看板分支同样传 `undefined`） |
| `.../components/LightdashVisualization/VisualizationProvider.tsx` | props + context value 增加 `isEditMode?: boolean` |
| `.../components/LightdashVisualization/context.ts` | `VisualizationContext` 增加 `isEditMode?: boolean` |
| `.../components/Explorer/VisualizationCard/VisualizationCard.tsx` | `<VisualizationProvider isEditMode={isEditMode} />`（变量已存在，见 `:114`） |

### 3.3 交互细节

- 手柄只在**最末级表头**（`colSpan === 1` 或最后一层 headerGroup）显示，避免分组表头误导。
- 拖动中不写 React state（性能），仅改 DOM；`mouseup` 一次性 `updateColumnProperty`。
- 拖动中同步更新同列 `tfoot`（页脚合计）宽度。
- `meta.isReadOnly` 本仓库不存在，去掉上游对应判断。

---

## 4. P1：透视表（VTable）拖拽 + 持久化

### 4.1 生成层：`pivotDataToVTable.ts`

1. 每个叶子列补 `key: <leafFieldId>`（新增字段，不影响数据绑定；仅 `getColumnByKey` 使用）。
2. 新增宽度解析（复用 §2.3 的 `widthKey`），并构造 VTable 原生配置：

```ts
const widthKey = col.columnType === 'indexValue' || col.columnType === 'label'
    ? col.fieldId
    : col.underlyingId ?? col.baseId;
const width = columnProperties[widthKey]?.width;

// 叶列定义
if (width !== undefined) {
    colDef.minWidth = Math.min(width, DATA_COLUMN_MIN_WIDTH);
    colDef.maxWidth = Math.max(width, dataColumnMaxWidth); // 避免「存 600 渲染 450」
}
// option 追加（ListTable 原生声明式宽度）
columnWidthConfig: leavesWithWidth.map((f) => ({ key: f, width }));
```

3. 序号列 `ROW_NUMBER_COLUMN_ID`、占位列 `__pivot_spacer__`：固定宽度，不进入 `columnWidthConfig`，并加 `disableColumnResize: true`。
4. 行合计列（`columnType === 'rowTotal'`，`baseId` 是 `row-total-{index}`）：不持久化（不稳定键）。

### 4.2 组件层：`PivotTableVTable/index.tsx`

```ts
columnResizeMode: editable ? 'header' : 'none',   // 替换现在的硬编码 'none'（:338）
disableDblclickAutoResizeColWidth: true,          // 避免双击触发一次「自适应」被落库
// 显式宽度与「铺满剩余空间」互斥
...(hasExplicitWidths ? {} : pivotAutoFillWidth ? { autoFillWidth: true } : {}),
```

监听事件（与现有 `CLICK_CELL`/`CONTEXTMENU_CELL` 同处注册）：

```ts
table.on(TABLE_EVENT_TYPE.RESIZE_COLUMN_END, (args: { col: number; colWidths: number[] }) => {
    const leaf = flattenedColsRef.current[args.col];       // 已有 ref
    if (!leaf) return;
    const pivotCol = pivotColumnInfoRef.current.find((c) => c.fieldId === leaf.field);
    const widthKey = /* §2.3 规则 */;
    if (!widthKey) return;                                  // 序号/占位/行合计
    const width = tableRef.current?.getColWidth(args.col);   // 已夹取
    if (width) onColumnWidthChange?.(widthKey, Math.round(width));
});
```

- 新 prop：`onColumnWidthChange?: (widthKey: string, width: number) => void`。
- `option` memo 增加 `columnWidthConfig` / `columnResizeMode` 依赖；`updateOption` 清缓存后由 `columnWidthConfig` 自动重灌宽度（无需手动 `setColWidth` 回填）。

### 4.3 `SimpleTable`

同一个 `onColumnWidthChange` 传给 `PivotTableVTable`（`SimpleTable/index.tsx:258-290`）。

---

## 5. P1.5：列配置面板（显示 / 重置）

`components/VisualizationConfigs/TableConfigPanel/ColumnConfiguration.tsx`（现有 name / visible / frozen 三件套）：

- `columnProperties[fieldId]?.width` 存在时，在冻结按钮后显示 `{width}px` 徽标 + 重置按钮 → `updateColumnProperty(fieldId, { width: undefined })`；
- 可选：提供 `NumberInput`（`min 50`、`max 1200`），便于不改图也能精调；
- 透视维度（Rows/Columns 区）如需要也补一个宽度输入（非必须，拖拽已覆盖）。

新增 i18n key（`packages/frontend/public/locales/{en,zh}/translation.json`）：

| key | en | zh |
|---|---|---|
| `components_visualization_configs_table.column_configuration.width` | `Width` | `列宽` |
| `...column_configuration.reset_width` | `Reset column width to auto` | `重置列宽为自动` |
| `components_common_table.resize_column` | `Drag to resize column` | `拖拽调整列宽` |

---

## 6. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R1 | HTML 表只写 `width` 无效 | 高 | 三值同写（§1.5 实测） |
| R2 | 总宽 < 容器时按比例拉伸，非严格 px | 中 | 接受（与上游一致）；不引入 `table-layout:fixed` / `max-content` |
| R3 | 冻列 `left` 硬编码 100，拖宽后重叠 | 高 | 按 `meta.width` 累加（P0 必做） |
| R4 | 拖动冻列时其它冻列 `left` 只在 mouseup 后更新（短暂重叠） | 低 | 接受，或拖动中同步 sticky `left` |
| R5 | `Th{position:relative}` 与 `.sticky-column{position:sticky}` 优先级 | 中 | 真机核对，必要时把 relative 移到内层 wrapper |
| R6 | 表头 DnD 与手柄事件冲突 | 中 | 手柄放 `Draggable` 外 + `stopPropagation`；图表平表本身未开启表头换序 |
| R7 | VTable `autoWidth` 忽略 `colDef.width` | 高 | 用 `columnWidthConfig` + `key`（§4.1） |
| R8 | `updateOption` 清宽度缓存 | 高 | 依赖 `columnWidthConfig` 每轮重灌；不要用 `setColWidth` 手工回填 |
| R9 | `pivotAutoFillWidth` 与像素宽度冲突 | 中 | 互斥：有显式宽度时忽略 autoFillWidth，并在面板提示 |
| R10 | 显式宽度被列的 `maxWidth(450)` 夹回 | 中 | `maxWidth = max(width, 全局上限)` |
| R11 | 编辑态误开（Minimal/Embed/AI） | 中 | 严格 `isEditMode === true && !isDashboard && !minimal` |
| R12 | bar 列固定 160px 与用户宽度冲突 | 低 | 用户宽度覆盖；重置回落到 160 |
| R13 | 生成物过期导致 CI 失败 | 高 | 必须重跑 `generate-api` + `generate:chart-as-code-schema` |
| R14 | 隐藏列宽度是否保留 | 低 | 保留（`useTableConfig` 的 prune 只删除不在 `selectedItemIds` 的 key） |
| R15 | 历史版本切换后 `columnProperties` 不同步（state 只在初始化读取） | 中 | 实现后验证「恢复历史版本」；必要时加 version 同步 effect |

---

## 7. 测试与验收

### 7.1 手工验收

1. Explore 编辑模式：拖动平表列宽 → 保存 → 刷新/重开 → 宽度保持。
2. Explore 编辑模式：透视表拖某指标列 → 该指标所有透视列同宽；改筛选使列集合变化 → 宽度不漂移到别的列。
3. 看板（查看 + 编辑模式）、Embed、Minimal：**无手柄**，宽度按保存值渲染。
4. 列名不再折行（`nowrap + ellipsis + 悬停 tooltip`）。
5. 列配置面板点 `180px` 徽标 → 恢复自动。
6. 冻列 + 拖宽：sticky 不重叠，横向滚动正常。
7. bar 列（160px）在无自定义宽度时外观不变。

### 7.2 单测

- `useColumnResize`：mock `getBoundingClientRect`，断言 `mouseup` 只回调一次、`min clamp 50`、卸载清理。
- `getDataAndColumns`：宽度三值同时写入；用户宽度覆盖 bar 160px。
- `pivotDataToVTable`：`widthKey` 规则、`columnWidthConfig` 生成、`maxWidth/minWidth` 调整（沿用现有 `pivotDataToVTable.test.ts` 风格）。
- `TableProvider` 冻列布局：抽纯函数 `getStickyColumnLayout(columns, rowWidth, defaultFrozenWidth)` 并单测。

### 7.3 命令

```bash
pnpm generate-api
pnpm -F common generate:chart-as-code-schema
pnpm -F common typecheck
pnpm -F frontend typecheck
pnpm -F frontend lint
pnpm -F common test
pnpm -F backend typecheck     # 仅在动到后端生成物/服务时
```

### 7.4 真机核对清单（实现后必做）

- [ ] VTable autoWidth + `columnWidthConfig` 首帧是否就位（无不必要闪烁）
- [ ] 拖动后立即 `updateOption` 是否抖动
- [ ] `pivotAutoFillWidth` 开启时的观感（确认互斥逻辑生效）
- [ ] 分组表头下叶子列右边界热区是否易发现
- [ ] 列集合变化后旧 key 是否被安全忽略

---

## 8. 待确认项

1. **列宽上限**：建议 `MIN 50px / MAX 1200px`（保守可 800px）。
2. **透视表宽度粒度**：本方案为「字段级共享」（同一指标多列同宽）。若要逐列精调，需另加 `headerPath` 键空间（v1 非目标）。
3. **面板交互**：只显示 px 徽标 + 重置（对齐上游），还是同时提供数字输入框。

---

## 9. 工作量与并行拆分

| 阶段 | 内容 | 预估 | 并行性 |
|---|---|---|---|
| P0 | 平表移植上游 #20359（含表头 `nowrap` 修折行）+ i18n | 1 天 | 与 P1 文件不重叠，可并行 |
| P1 | VTable 透视表拖拽 + `columnWidthConfig` + `key` | 1 天 | ✔ |
| P1.5 | `SimpleTable` 门控 + `VisualizationProvider.isEditMode` + 面板宽度/重置 | 0.5 天 | 依赖 P0/P1 的回调签名 |
| P2 | 生成物重跑 + 单测 + 真机核对（冻列 / sticky / autoFillWidth） | 0.5 天 | — |

> 建议分工：P0 / P1 两路并行实现（各自 owned 文件不重叠）；`SimpleTable`、`VisualizationProvider`、`context.ts`、i18n 由同一人统一改以避免冲突；最后交叉 review diff（重点：冻列 offset、VTable 宽度夹取、门控是否误开）。

---

## 10. 附录

### 10.1 上游参考（可直接对照实现）

- PR diff：<https://github.com/lightdash/lightdash/pull/20359.diff>（512 行，含 `useColumnResize.ts` / `ResizeHandle.module.css` / `TableHeader` / `TableProvider` / `getDataAndColumns` / `useTableConfig` / `ColumnConfiguration`）
- 官方行为：<https://docs.lightdash.com/visualizations/table>（"Resize columns"：仅 Explore 编辑模式、宽度随 chart 保存、最小 50px、溢出省略号、面板可重置）
- Changelog：<https://changelog.lightdash.com/resize-table-chart-columns-332507>（0.2615.0）

### 10.2 本次调研产物（本地，未入库）

- VTable 语义核查：`~/.pi/agent/herd/runs/2026-10-30_table-col-width/research/vtable-width-research.md`
- 平表改造与布局实测：`~/.pi/agent/herd/runs/2026-10-30_table-col-width/research/flat-table-width-research.md`
- 相关历史提交：`8c2e38dd2`（透视表列宽自动撑满/最大宽度配置）、`6cedaac00`（显式设置 `columnResizeMode:'none'`）、`09855f9af`（列宽逻辑整理）

### 10.3 关键代码位置速查

| 用途 | 位置 |
|---|---|
| `ColumnProperties` / `TableChart` | `packages/common/src/types/savedCharts.ts:162` / `:174` |
| 列属性 state 与更新 | `packages/frontend/src/hooks/tableVisualization/useTableConfig.ts:184` / `:563` / `:668` |
| 平表列定义与宽度 meta | `packages/frontend/src/hooks/tableVisualization/getDataAndColumns.tsx:160-166` |
| 平表表头 | `packages/frontend/src/components/common/Table/ScrollableTable/TableHeader.tsx` |
| 冻列 sticky 偏移 | `packages/frontend/src/components/common/Table/TableProvider.tsx:93-109` |
| 透视表渲染 / VTable option | `packages/frontend/src/components/common/PivotTableVTable/index.tsx:308-340` / `:521-530` |
| 透视表列生成 | `packages/frontend/src/components/common/PivotTableVTable/pivotDataToVTable.ts:66-73` / `:345-390` / `:520-640` |
| 透视列 fieldId 生成规则 | `packages/common/src/pivot/pivotQueryResults.ts:236-247` / `:310-324` |
| 表格入口与门控位置 | `packages/frontend/src/components/SimpleTable/index.tsx:200-290` / `:318-345` |
