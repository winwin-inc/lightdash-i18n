# 表格可视化体验优化批次（W1–W4）

> 状态：**已实施**（批次 1）。承载分支 `feat/optimizations` 是一个**通用 UI/UX 优化分支**，
> 后续优化需求继续往这个分支上加；本文件只描述**批次 1（表格）**的范围。
> W1 的实现细节见同目录 [`table-column-resize-plan.md`](./table-column-resize-plan.md)。
> 触发问题：列数较多时，部分列的表头（列名）会被压成两行、甚至三行，观感很差；
> 希望可以左右拖拽、按实际字段内容调整列宽。
> 产品问题与结论：
> - 「查看模式自主编辑 / 编辑模式拖动 / 固定就行」→ **不是三选一，而是分层**：
>   **编辑模式拖完落库（团队共享），查看模式拖完只影响自己（本地记住）**。
> - 因此本批次同时覆盖 **Explore 编辑态**、**Explore 查看态**、**看板（查看/编辑）**、
>   **Embed / Minimal**；只有「是否写回 chart 配置」不同，交互一致。

---

## 0. 批次范围

| 编号 | 项 | 优先级 | 状态 |
|---|---|---|---|
| **W1** | 列宽拖拽：编辑模式落库 + 查看模式本地记住（平表 & 透视表） | P0 | ✅ 已实施 |
| **W2** | 表头不折行：单行 + 省略号 + 悬停显示完整列名（平表） | P0 | ✅ 已实施 |
| **W3** | 列宽重置入口：列配置面板 `px` 徽标 + 双击手柄恢复自动 | P1 | ✅ 已实施 |
| **W4** | 冻列 sticky `left` 跟随实际列宽（修既有硬编码 100px 的重叠 bug） | P1 | ✅ 已实施 |
| W5 | 触屏 / 键盘调整列宽（Pointer Events + `aria-valuenow`） | P2 | ⬜ 非本期 |
| W6 | 透视表逐叶子列精调（同一指标不同维度值各自宽度） | P2 | ⬜ 非本期 |
| W7 | Explore 原始 Results 表 / Underlying data / SQL Runner 表格列宽 | P2 | ⬜ 非本期（无 chart 配置载体） |

非目标理由：
- W5：鼠标拖拽 + 双击重置已覆盖主要场景，触屏/键盘需另做可访问性方案。
- W6：透视叶子列 `fieldId` 是「表头拼接 + colIndex」（`packages/common/src/pivot/pivotQueryResults.ts:236-247`），
  随筛选/指标数量漂移，无法作为持久化键；需引入 `headerPath` 键空间。
- W7：这些表没有 `TableChart.columnProperties` 落库载体。

---

## 1. 宽度分层模型（本批次的核心决策）

同一份宽度值有 **两个来源**，按优先级合并：

```
优先级 1（最高）：本地覆盖 localStorage / React state  ← 查看模式拖拽写这里
优先级 2：       chartConfig.columns[fieldId].width     ← 编辑模式拖拽写这里（落库）
优先级 3：       bar 列固定 160px                        ← 既有逻辑
优先级 4：       自适应（平表 max 300 / VTable autoWidth）
```

| 场景 | 手柄 | 拖拽写到哪里 | 刷新后 | 别人看到 |
|---|---|---|---|---|
| Explore 编辑模式 | ✅ | `chartConfig.columns[].width`（落库） | 保持 | 保持一致（团队共享） |
| Explore 查看模式 | ✅ | localStorage（按 `savedChartUuid`） | 保持 | 不受影响 |
| 看板 查看模式 | ✅ | localStorage（按 `savedChartUuid`） | 保持 | 不受影响 |
| 看板 编辑模式 | ✅ | localStorage（看板 tile 本就没有 `onChartConfigChange`） | 保持 | 不受影响 |
| Embed（看板非 minimal） | ✅ | localStorage（按 `savedChartUuid`） | 保持 | 不受影响 |
| Minimal（含截图/预览） | ❌ 无手柄 | —— | —— | 不受影响 |
| AI 生成图表（无 uuid） | ✅ | 仅 React state（会话内） | 丢失 | 不受影响 |

设计取舍：
- **为什么不给查看模式也落库？** 看板 tile 的 `onChartConfigChange` 本就没接线（`DashboardTiles/DashboardChartTile.tsx`），
  强行接会让「看板浏览者拖动列宽」变成写操作，且需要额外的权限/冲突处理。
- **为什么不干脆只做编辑模式（上游做法）？** 上游 PR #20359 明确把看板/查看模式排除在外；
  但本仓库的列宽问题是「列多 → 表头折行 → 看板里难看」，如果只能回 Explore 改，
  对看板使用者无解。本地记住是成本最低的折中：零写操作、零权限、刷新仍在。
- **localStorage key 粒度：按「看板 tile」隔离**
  - 看板内：`ld:table-col-width:v1:<savedChartUuid>:tile:<tileUuid>`
  - 图表页 / Explore 查看态（没有 tile）：`ld:table-col-width:v1:<savedChartUuid>`
  - 无 `savedChartUuid`：退化为纯会话内 state，不写 localStorage。
  - 理由：同一图表放进两个看板，tile 尺寸往往不同；图表级共享会让 A 看板拖宽把 B 看板也改了。
  - 不用 `versionUuid` 做 key（每次保存都变 → 一保存就丢宽度）。
  - 已知取舍：**tile 复制 / 删除重建会换 `tileUuid`**，本地宽度随之丢失（重新拖一次即可；
    落库宽度不受影响，因为它存在 chart 配置里）。
- **Minimal 不出手柄**：`/minimal/...` 同时是 `UnfurlService` 的 headless 截图通道，
  手柄会进入预览图；因此 `SimpleTable` 里 `minimal === true` 时直接不传 `onColumnWidthChange`。
- **判断「能否写回」只能看 `isEditMode`**：Explore 的 View 模式同样接了
  `onChartConfigChange`（`VisualizationCard.tsx:424` 的 `setChartConfig`，写进 redux 的
  `unsavedChartVersion`），若查看态把宽度写进 `columnProperties`，会污染「未保存改动」。
  同理 `savedChartUuid` 在编辑模式被故意置空（`VisualizationCard.tsx:422`），不能当判据。

---

## 2. 现状与关键代码事实（已核对）

### 2.1 两套渲染路径

| 渲染路径 | 触发条件 | 表头折行 | 现状宽度逻辑 |
|---|---|---|---|
| 平表 `SimpleTable` → `common/Table`（TanStack + `<table>`） | 无透视维度 | **会折行**（`Th` 无 `white-space`，默认 `max-width: 300px`） | 仅 `meta.style.{width,minWidth,maxWidth}`；唯一显式宽度是 bar 列 160px |
| 透视表 `SimpleTable` → `PivotTableVTable`（VTable Canvas） | 有透视维度 | 不折行（省略号 + tooltip） | `widthMode:'autoWidth'` + `limitMaxAutoWidth`；`columnResizeMode:'none'` 硬编码禁用拖动 |

关键位置（行号为改动前）：
- `packages/frontend/src/components/common/Table/Table.styles.ts:328-339`（`Th`）、`:353`（`ThLabelContainer` 空壳）、`:355-367`（`ThActionsContainer`）
- `packages/frontend/src/components/common/Table/TableProvider.tsx:93`（`const frozenColumnWidth = 100` 硬编码）
- `packages/frontend/src/hooks/tableVisualization/getDataAndColumns.tsx:157-166`（bar 列 160px）
- `packages/frontend/src/components/common/PivotTableVTable/index.tsx:308-340`（VTable option）、`:338`（`columnResizeMode: 'none'`）
- `packages/frontend/src/hooks/tableVisualization/useTableConfig.ts:184`（`columnProperties` state）、`:563`（`updateColumnProperty`）、`:668`（`validConfig.columns`）

### 2.2 宽度载体：`ColumnProperties.width`

```ts
// packages/common/src/types/savedCharts.ts
export type ColumnProperties = {
    visible?: boolean;
    name?: string;
    frozen?: boolean;
    displayStyle?: 'text' | 'bar';
    width?: number; // px 整数；undefined = 自动
};
```

- `chartConfig` 是 JSON 列 → **零 migration**。
- `RenameService` 按 key 重写 `columns`（`packages/backend/src/services/RenameService/rename.ts:355`），字段重命名时宽度跟随。
- chart-as-code schema 与 TSOA 生成物需要重跑（见 §5）。

### 2.3 与既有「列宽相关」设置的关系

改动前表配置面板里已经有 3 个宽度相关项（都在透视表分支），它们都**不是单列宽度**：

| 既有设置 | 语义 | 与拖拽的关系 |
|---|---|---|
| `pivotDimensionColumnMaxWidth` | 行维度列**最大**宽度（内容自适应时的上限） | 拖拽过的列会把自己的 `maxWidth` 放大到显式宽度 → 该列**不再受此上限**约束，其它列仍受约束 |
| `pivotColumnMaxWidth` | 数据列**最大**宽度（同上） | 同上 |
| `pivotAutoFillWidth`（「铺满剩余空间」） | 列总宽 < 容器时**整表等比放大** | 与像素级宽度**互斥**：一旦有显式宽度，该开关**置灰且不生效**（VTable 的 `getAdaptiveWidth` 会覆盖手动宽度） |

优先级（从高到低）：

```
显式列宽（拖拽/面板重置产物）
  > 全局最大宽度上限（pivot*ColumnMaxWidth）
  > bar 列固定 160px
  > 内容自适应（平表 300 上限 / VTable autoWidth + limitMaxAutoWidth 450）
「铺满剩余空间」只对「没有任何显式宽度」的图生效
```

> 面板里「铺满剩余空间」置灰 + tooltip 说明，避免出现「开关是开的但其实没生效」。

### 2.4 HTML `<table>` 布局约束（实测）

- 必须 `width/minWidth/maxWidth` **三值同写**，只写 `width` 会被内容撑到 300px。
- `meta.style` 的宽度在本仓库被当成**字符串**消费：
  - `TableHeader` → `$width={meta?.style?.width as string}`，样式模板是 `width: ${$width};`
  - `BodyCell` → `width={width}`，类型 `string`
  → **必须传 `'180px'` 而不是 `180`**（上游 PR 传的是 number，照搬会静默失效）。
- 总宽 < 容器时按比例拉伸是 HTML 表格固有行为，接受（与上游一致），不改 `table-layout`。

### 2.4 VTable（`@visactor/vtable@1.23.3`）事实

| 事实 | 证据（`node_modules/.pnpm/@visactor+vtable@1.23.3/.../es`） |
|---|---|
| `widthMode:'autoWidth'` 下 colDef `width` 被忽略 | `core/BaseTable.js` `getColWidthDefined()`：`if ('autoWidth' === this.widthMode) return 'auto'` |
| 声明式宽度入口是 `columnWidthConfig: { key, width }[]` | `ts-types/base-table.d.ts` `ListTableProtected`；`scenegraph/layout/compute-col-width.js` `_parseColumnWidthConfigForListTable()` |
| 每次 `computeColsWidth` 都会重新套用，并按**叶列 `define.key`** 匹配 | 同上 + `layout/simple-header-layout.js` `getColumnByKey()` 比对 `columnData.define.key` |
| 套用后会加入 `_widthResizedColMap`，之后的自动算宽不会覆盖它 | `_parseColumnWidthConfigForListTable` 里 `_setColWidth` + `_widthResizedColMap.add(col)`；`getColWidthDefinedWidthResizedWidth()` |
| `updateOption(clearColWidthCache)` 会清空该 map，但下一轮算宽会从 `columnWidthConfig` 重灌 | `core/BaseTable.js:1073`、`compute-col-width.js:23` |
| 拖动结束事件 `RESIZE_COLUMN_END`，payload `{ col, colWidth }`；`getColWidth(col)` 可取夹取后宽度 | `event/listener/table-group.js` `endResizeCol()`、`core/TABLE_EVENT_TYPE.js:19-20` |
| 选项名（1.23.3 生效写法）：`resize.columnResizeMode`、`resize.disableDblclickAutoResizeColWidth`；`columnResizeMode` 顶层已是 deprecated | `ts-types/base-table.d.ts:326-333` |
| 列级 `disableColumnResize` 可禁止某列拖动 | `ts-types/table-engine.d.ts:93` |
| `autoFillWidth` 会按 `factor` 等比缩放**所有**列 | `compute-col-width.js` `getAdaptiveWidth()` |
| `_adjustColWidth` 会把宽度夹到列的 `[minWidth, maxWidth]` | `core/BaseTable.js` `_adjustColWidth` / `setMinMaxLimitWidth` |

→ 结论：透视表用 `columnWidthConfig + 叶列 key`，**不要**给 colDef 写 `width`；
显式宽度时要同步放大该列的 `maxWidth`，否则「存 600 渲染 450」。

---

## 3. W1：列宽拖拽

### 3.1 平表（`common/Table`）

新增/改动：

| 文件 | 内容 |
|---|---|
| `common/Table/useColumnResize.ts` | **新增**：拖动期只改 DOM（`th` + 同列 `td/th/tfoot` + `colgroup col`），`mouseup` 回调一次；`mousedown` `preventDefault + stopPropagation`；`min 50 / max 1200` 夹取；`dblclick` → 回调 `null`（恢复自动）；卸载清理监听 |
| `common/Table/ResizeHandle.module.css` | **新增**：6px 竖条手柄，`position:absolute; right:0; cursor:col-resize; touch-action:none; z-index:2`，hover 蓝色 |
| `common/Table/Table.styles.ts` | `Th` 加 `position: relative`；`ThLabelContainer` 改为单行省略（W2）；`ThActionsContainer` 加 `flex-shrink: 0` |
| `common/Table/ScrollableTable/TableHeader.tsx` | 在 `@hello-pangea/dnd` 的 `Draggable` **之外**渲染手柄（避免与表头拖拽换序冲突）；条件：`onColumnWidthChange && 最末级表头 && header.id !== ROW_NUMBER_COLUMN_ID`；`role="separator"` + i18n `aria-label` + `data-testid` |
| `common/Table/TableProvider.tsx` | 冻列 `left` 按 `col.meta?.width ?? 100` 累加（W4）；透出 `onColumnWidthChange` |
| `common/Table/types.ts` | `ProviderProps.onColumnWidthChange?: (fieldId: string, width: number \| null) => void` |
| `hooks/tableVisualization/getDataAndColumns.tsx` | 新增 `getColumnWidth` 参数 → `getColumnWidthMeta(width)` 产出 `{ width, style: { width: 'Npx', minWidth: 'Npx', maxWidth: 'Npx' } }`；放在 bar 160px **之后**（用户宽度优先） |
| `hooks/tableVisualization/useTableConfig.ts` | `getColumnWidth` / `setLocalColumnWidth`，本地覆盖层 state；`columns` 依赖补全 |
| `components/SimpleTable/index.tsx` | 组装 `onColumnWidthChange`：编辑模式 → `updateColumnProperty(fieldId, { width })`；其余 → `setLocalColumnWidth` |

交互细节：
- 手柄只在**最末级表头**显示（`colSpan === 1` 或最后一个 headerGroup），避免分组表头误导。
- 拖动中不写 React state（大表卡顿），仅改 DOM；`mouseup` 一次性提交。
- 拖动中同步 `tfoot`（页脚合计）与冻列 `left`（sticky 不重叠）。

### 3.2 透视表（VTable）

| 文件 | 内容 |
|---|---|
| `PivotTableVTable/pivotDataToVTable.ts` | 叶列补 `key: <widthKey>`；读取宽度后 `colDef.minWidth = Math.min(width, 现有 min)`、`colDef.maxWidth = Math.max(width, 现有 max)`（避免夹取）；输出 `columnWidthConfig: { key, width }[]` |
| `PivotTableVTable/index.tsx` | `resize.columnResizeMode: canResize ? 'header' : 'none'`、`resize.disableDblclickAutoResizeColWidth: true`；`columnWidthConfig` 并入 option；`RESIZE_COLUMN_END` → 用 `flattenedColsRef` + `pivotColumnInfoRef` 反查 `widthKey` → 回调；`autoFillWidth` 与显式宽度互斥 |
| `SimpleTable/index.tsx` | 同一个 `onColumnWidthChange` 传给 `PivotTableVTable` |

`widthKey` 规则（两个渲染路径统一）：

```ts
// 行维度 / label 列 → 维度 fieldId；数据列 → 底层指标字段
const widthKey =
    col.columnType === 'indexValue' || col.columnType === 'label'
        ? col.fieldId
        : col.underlyingId ?? col.baseId;
```

序号列、占位列（`__pivot_spacer__`）、行合计列（`row-total-{index}`）不参与宽度持久化。

---

## 4. W2 / W3 / W4

### W2 表头不折行

- `Th` 仍是 `th`，但内部 `ThLabelContainer` 改为：
  `overflow: hidden; min-width: 0; flex: 1; white-space: nowrap; text-overflow: ellipsis;`
- 表头文字外套 `<span title={完整列名}>`（或 Mantine `Tooltip`）→ 截断后可看全名。
- `.sticky-column:hover { white-space: normal }` 既有规则保留（冻列 hover 展开不受影响）。
- 效果：**不改任何配置**，多列表头也不再折行；列宽不足时显示「…」。

### W3 重置

- 列配置面板：`columnProperties[fieldId]?.width` 存在时显示 `180px` 徽标 + `×`，
  点击 `updateColumnProperty(fieldId, { width: undefined })`。
- 手柄双击：`onColumnWidthChange(fieldId, null)` → 编辑模式落库为 `undefined`，
  查看模式删除本地覆盖。
- i18n：

| key | en | zh |
|---|---|---|
| `components_common_table.resize_column` | `Drag to resize column` | `拖拽调整列宽` |
| `components_common_table.reset_column_width` | `Double-click to reset column width` | `双击恢复自动列宽` |
| `components_visualization_configs_table.column_configuration.width` | `Column width` | `列宽` |
| `components_visualization_configs_table.column_configuration.reset_width` | `Reset column width to auto` | `重置为自动列宽` |

### W4 冻列偏移

- 现状：`frozenColumnWidth = 100` 硬编码，冻列被拖宽后其它冻列 `left` 不更新 → 叠字。
- 改法：按 `col.meta?.width ?? 100` 累加 `cumulativeLeft`，`left = rowColumnWidth + Σ前序列宽`。
- 已验证：`meta.width` 是 number（`Table/types.ts:39`），与 `meta.style.width`（string）分离，两者需同时写。

---

## 5. 生成物与验证

必须重跑（改 `ColumnProperties` 后）：

```bash
pnpm generate-api
pnpm -F common generate:chart-as-code-schema
pnpm -F common typecheck
pnpm -F frontend typecheck
pnpm -F frontend lint
pnpm -F common test
```

手工验收清单：

- [ ] Explore 编辑模式：拖平表列宽 → 保存 → 刷新/重开 → 宽度保持；他人可见。
- [ ] Explore 查看模式：拖宽 → 刷新 → 保持；退出登录/换浏览器 → 回默认。
- [ ] 看板（查看 + 编辑）、Embed、Minimal：可拖、刷新保持、**不产生任何写请求**。
- [ ] 表头不再折行；列宽不足时显示省略号 + 悬停完整名。
- [ ] 面板 `180px` 徽标 → 点 `×` 恢复自动；双击手柄同样恢复。
- [ ] 冻列拖宽后 sticky `left` 正确，无重叠、横向滚动正常。
- [ ] 透视表：拖某指标列 → 该指标所有透视列同宽；改筛选/指标数量 → 宽度不漂移。
- [ ] 透视表 + `pivotAutoFillWidth`：有显式宽度时不再等比拉伸。

---

## 6. 风险与对策

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| R1 | `meta.style.width` 传 number 静默失效 | 高 | 统一 `px` 字符串（§2.3） |
| R2 | 冻列 `left` 用旧硬编码 → 拖宽后重叠 | 高 | W4 按实际宽度累加 |
| R3 | `updateOption` 清宽度缓存导致回弹 | 高 | 依赖 `columnWidthConfig` 每轮重灌，不用 `setColWidth` 手工回填 |
| R4 | 显式宽度被列的 `maxWidth(450)` 夹回 | 中 | `maxWidth = max(width, 全局上限)` |
| R5 | `pivotAutoFillWidth` 与像素宽度冲突 | 中 | 有显式宽度时忽略 autoFillWidth |
| R6 | localStorage 串图/脏数据 | 中 | key 用 `savedChartUuid`；读取时过滤非法值（非数字/<50/>1200）；无 uuid 不落盘 |
| R7 | 看板 tile 拖拽与 tile 自身交互冲突 | 中 | 手柄仅 6px 且在表头内；`stopPropagation`；真机验证看板编辑态 |
| R8 | 表头 DnD 与手柄事件冲突 | 中 | 手柄放 `Draggable` 外 + `preventDefault/stopPropagation` |
| R9 | 生成物过期导致 CI 失败 | 高 | 重跑 `generate-api` + chart-as-code schema |
| R10 | 隐藏列宽度被 `useTableConfig` prune 清掉 | 低 | 既有 prune 只删不在 `selectedItemIds` 的 key；面板重置是显式操作 |
| R11 | `getColumnWidth` 依赖数组放到 `columnProperties` 声明之前（TDZ 崩溃） | 高 | 实现时该 `useCallback` 必须放在 `columnProperties` 之后；已在代码中确认 |
| R12 | 面板「重置」只清落库宽度、本地覆盖仍在 → 看起来没变化 | 中 | 面板重置同时 `setLocalColumnWidth(fieldId, null)` |

---

## 7. 工作量与分工（已执行）

| 阶段 | 内容 | 并行性 |
|---|---|---|
| P0 | W1 平表（hook + 手柄 + Provider + 门控） | 与 P1 文件不重叠 |
| P1 | W1 透视表（`pivotDataToVTable` + VTable option/事件） | 与 P0 并行 |
| P2 | W2 + W3 + W4 + i18n（集中在 `Table.styles` / 面板 / Provider） | 依赖 P0/P1 回调签名 |
| P3 | 生成物 + typecheck/lint/test + 真机核对 | 串行收尾 |

调研产物（本地，未入库）：
- `~/.pi/agent/herd/runs/2026-11-02_mcp-dashboard-strict/research/`（平表 / VTable / 查看模式三路调研）
- 上游参考：<https://github.com/lightdash/lightdash/pull/20359>、<https://docs.lightdash.com/visualizations/table>
