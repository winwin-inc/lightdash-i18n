# 表格滚动卡顿排查说明

**阅读指引**：只关心当前实现看 **§1、§4、§8**；排查平表或原 DOM 透视表卡顿看 **§2、§3、§6、§7**。

---

## 1. 现象与实现

在 Explorer 或看板中，当表格配置了「按列分组、条件格式、柱状图、多列」时，上下/左右滑动明显卡顿。

- **平表**：`common/Table` → `ScrollableTable` → `TableBody`（行虚拟化）
- **透视表（当前）**：`SimpleTable` → **PivotTableVTable**（透视表 v2，Canvas 渲染，VTable 内置虚拟滚动）

### 1.1 透视表 v2（PivotTableVTable）— 当前方案

| 项 | 说明 |
|----|------|
| **实现** | 基于 VTable（VisActor）Canvas 渲染，替换原 DOM 版 PivotTable。 |
| **已支持** | 条件格式、条形图、tooltip、右键复制、多级表头、行/列合计。 |
| **未实现** | **展开/收起**（showSubtotals 分组下的行展开/收起交互）：当前 VTable 版无此功能；若产品需要，可后续评估在 VTable 上实现或采用其他方案。 |
| **旧实现** | 原 DOM 版 `PivotTable/` 保留便于排查；下文 §3、§6、§7 针对平表或原 DOM 透视表。 |

平表与透视表均只做**行虚拟化**，无列虚拟化。

---

## 2. 卡顿原因（与是否已缓解）

以下针对**平表 / 原 DOM 透视表**；透视表 v2 的滚动与渲染由 VTable 内部负责。

| 原因 | 状态 | 说明 |
|------|------|------|
| 仅行虚拟化、列全渲染 | **不处理** | 列虚拟化不考虑；列多时左右滚动仍会重绘可见列。 |
| 条件格式每格计算 | 已缓解 | TableRow 内改为整行一次 useMemo（cellFormatMap），按 cell.id 查表。 |
| tableRowElements useMemo 每帧重算 | 已缓解 | 用 rowsRef + rowsKey 做依赖，不直接依赖 `rows`。 |
| 行/单元格/柱状图未 memo | 已缓解 | TableRow、BodyCell、BarChartDisplay 均已 memo。 |
| overscan 偏大 | 不再压低 | 曾降至 10/5 会致快速滚动白屏，已恢复 **25**（视口上下各多渲染 25 行，快速滚动可正常展示）。 |
| 表头表尾 sticky + table 布局 | 未缓解 | 滚动时整表参与布局；Td 已加 `contain: paint` 缩小重绘。 |

---

## 3. 已做优化（汇总，平表 / 原 DOM 透视表）

| 类别 | 已做 |
|------|------|
| **平表** | visibleRowIndicesKey/rowsRef+rowsKey、TableRow/BodyCell/BarChartDisplay memo、条件格式按行 useMemo、条形图懒加载、tr contain:paint、SCROLL_THRESHOLD 100。 |
| **原 DOM 透视表** | PivotTableBody 隔离、overscan 25 + 可见行优先计算、条件格式 formatCacheRef 跨行缓存 + 延后算、useDeferredValue(cellFormatMap)、@tanstack/react-virtual ^3.13、useFlushSync:false、条件格式 Worker（可选）、LightTable contain + overflow-anchor（±will-change）。 |
| **共用** | 条形图懒加载（BarChartDisplay）。 |

**结论**：透视表 v2 使用 VTable 内置虚拟滚动，无上述 DOM 层优化。

---

## 4. 数据与可观测

**为何页脚 "248 results" 与某处 1984 不一致**  
- 248 来自**透视表**（`pivotTableData.data.rowsCount`）；1984 来自**平表**（`resultsData.totalResults`），是两张表。按列分组、多级列头的是透视表（当前为 PivotTableVTable）。

**如何判断虚拟化与是否加载完**  
- **平表**：看 `<tbody>` 的 data 属性（见下表）。**透视表 v2** 为 Canvas 渲染，无上述 data 属性，由 VTable 内部管理视口。

| 属性 | 含义（平表） |
|------|----------------|
| data-virtualized | 行虚拟化常开时为 `"true"`。 |
| data-rows-rendered | 视口+overscan 行数。 |
| data-rows-loaded | 已加载行数。 |
| data-total-rows | 总结果数（即 "N results" 的 N）。 |

平表全部加载完：`data-rows-rendered` 与 `data-total-rows` 相等（或看 data-rows-loaded）。

---

## 5. 已尝试过的方案（勿重复）

| 方案 | 结论 |
|------|------|
| 按行数阈值关闭虚拟化（平表 ≤300 / 透视表 ≤80 不虚拟化） | 248+ 行全量渲染滚动卡死，已移除，**始终虚拟化**。 |
| NonVirtualizedTableBody（全量渲染+原生滚动） | 已删除，平表只保留 VirtualizedTableBody。 |
| 用 rows.length 或 totalRowsCount 与页脚对齐做阈值 | 不虚拟化仍卡；**统一始终虚拟化**，不再做行数分支。 |
| 调试用 console.log（TableBody/PivotTable） | 已移除；需要时可看 tbody data-*。 |
| :first-child → :first-of-type | 已做且保留（样式/SSR，非卡顿）。 |

---

## 6. 后续可做（平表 / 原 DOM 透视表）

| 项 | 说明 |
|----|------|
| **列虚拟化** | 不处理。 |
| 条件格式跨行缓存 | 可选；需维护缓存失效。 |
| 滚动 throttle/RAF | 需测与 @tanstack/react-virtual 兼容性。 |
| Profiler 定位 | 录滚动确认 TableRow / 条件格式 / BarChartDisplay 热点。 |
| 其他 | Context 拆分、稳定回调引用（useCallback）、will-change 取舍（见 §7）。 |

---

## 7. 白屏、CSS 与替代方案（平表 / 原 DOM 透视表）

透视表 v2 为 Canvas，白屏与占位由 VTable 控制；本节仅对平表与原 DOM 透视表有效。

**现象**：快速滚动或滚到 overscan 区域时，大段空白、较久才渲染。

**原因**：(1) 新行大量挂载 + 条件格式计算占满主线程；(2) 滚动容器 `will-change: transform` 单独合成层，新内容等层更新后才绘制（去掉则可能更卡）。

**LightTable 滚动容器 CSS**：`overflow: auto`、`contain: paint`（缩小重绘范围）、`will-change: transform`（顺滑与白屏的取舍）、`overflow-anchor: none`（避免虚拟化插入/删除拽动视口）。

**已做**：overscan 25、可见行优先计算（virtualRows 中间约 50% 优先 rAF 算条件格式，其余 requestIdleCallback）、VirtualizedArea 浅灰占位；原 DOM 版还有 formatCacheRef、useDeferredValue、条件格式 Worker。**可选**：骨架行、overscan 20～30 微调、Profiler 定位挂载/paint。

**替代方案（历史参考）**：react-virtuoso（需改 body）；Canvas 已由透视表 v2 采用（PivotTableVTable + VTable）。

---

## 8. 涉及文件

- `TableBody.tsx`、`Table.styles.ts`、`BodyCell.tsx` — 平表
- **`PivotTableVTable/`** — **透视表 v2（当前使用）**：VTable Canvas 渲染，`pivotDataToVTable` 转换、`pivotFormatMap` 条件格式、条形图、tooltip、右键复制；无展开/收起
- `PivotTable/` — 原 DOM 透视表（保留便于排查），含 PivotTableBody、useVirtualizer、条件格式 Worker 等
- `LightTable/index.tsx` — 透视表外层滚动容器
- `useColumns.tsx`、`barChartDisplay.tsx` — 条件格式、柱状图（平表与旧透视表）
