# 表格滚动卡顿排查说明

## 1. 现象与实现

在 Explorer 或看板中，当表格配置了「按列分组、条件格式、柱状图、多列」时，上下/左右滑动明显卡顿。

- **平表**：`common/Table` → `ScrollableTable` → `TableBody`（行虚拟化）
- **透视表**：`SimpleTable` → `PivotTable`（行虚拟化）

两套均只做**行虚拟化**，无列虚拟化。

---

## 2. 卡顿原因（与是否已缓解）

| 原因 | 状态 | 说明 |
|------|------|------|
| 仅行虚拟化、列全渲染 | **不处理** | 列虚拟化不考虑；列多时左右滚动仍会重绘可见列。 |
| 条件格式每格计算 | 已缓解 | TableRow 内改为整行一次 useMemo（cellFormatMap），按 cell.id 查表。 |
| tableRowElements useMemo 每帧重算 | 已缓解 | 用 rowsRef + rowsKey 做依赖，不直接依赖 `rows`。 |
| 行/单元格/柱状图未 memo | 已缓解 | TableRow、BodyCell、BarChartDisplay 均已 memo。 |
| overscan 偏大 | 不再压低 | 曾降至 10/5 会致快速滚动白屏，已恢复 **25**（视口上下各多渲染 25 行，快速滚动可正常展示）。 |
| 表头表尾 sticky + table 布局 | 未缓解 | 滚动时整表参与布局；Td 已加 `contain: paint` 缩小重绘。 |

---

## 3. 已做优化（汇总）

| 项 | 说明 |
|----|------|
| visibleRowIndicesKey + useMemo | 仅当可见行索引集合变化时重造 TableRow 列表，避免无关 state 导致整表重造。 |
| rowsRef + rowsKey | 不依赖 `rows` 引用，仅在行 id 或可见索引变化时重算 tableRowElements。 |
| TableRow / BodyCell / BarChartDisplay memo | 减少父级重绘导致的子组件重绘。 |
| 条形图懒加载 | BarChartDisplay 首帧只渲染文字（formatted），下一帧 requestAnimationFrame 后再渲染条形，减轻表格首屏与滚动时主线程压力；平表与透视表共用该组件，均受益。 |
| 条件格式按行一次 useMemo | cellFormatMap 整行算一次，ref 存 getConditionalRuleLabelFromItem。 |
| overscan | 平表未改；**透视表 25**。配合**可见行优先计算**：视口中间约 50% 行下一帧算条件格式，其余行 requestIdleCallback 延后算，无需更大 overscan 也能先出可见区颜色。 |
| 透视表 PivotTableBody 隔离 | useVirtualizer 移入独立 PivotTableBody 组件，滚动时仅 body 重渲染，表头/表尾不参与，减轻卡顿。 |
| 透视表条件格式缓存 + 延后算 | **跨行缓存（相同数值复用）**：按 (fieldId, value, rowFields) 缓存每格结果，多行同值只算一次；conditionalFormattings/minMaxMap 变化时清空。**延后算 + 可见优先**：首帧仅原始值，优先行在 rAF 下一帧自算（用 formatCacheRef），非优先行 requestIdleCallback 延后；已移除父级预计算，每行只在自身 effect 里算。 |
| 透视表条件格式 useDeferredValue | PivotTableRow 内 cellFormatMap 经 useDeferredValue 再用于渲染，React 可先出纯数据再应用底色，滚动时少阻塞。 |
| @tanstack/react-virtual 升级 | 前端依赖升级至 ^3.13，含 getTotalSize 等修复，仅影响透视表/平表虚拟化。 |
| useVirtualizer useFlushSync: false | 透视表 PivotTableBody 内关闭 flushSync，滚动时由 React 批量更新而非同步强制刷，减轻主线程阻塞；类型若未包含该选项可用 as 断言。 |
| 条件格式 Worker | 透视表可选：条件格式（backgroundColor/fontColor）在 Web Worker（conditionalFormatting.worker.ts）中计算，主线程只补 tooltip；Worker 创建失败时自动回退到主线程 computeCellFormatMapForRow。 |
| CSS（仅透视表） | 透视表滚动容器（LightTable Box）：contain: paint + overflow-anchor: none；若去掉 will-change 则优先「先出数据」，若保留则滚动更顺。**平表未改**。 |
| SCROLL_THRESHOLD = 100 | 触底 100px 时触发 `fetchMoreRows()`（平表）。 |

**结论**：**平表暂不修改**；透视表行虚拟化 + PivotTableBody 隔离 + 滚动容器 CSS 优化，行虚拟化始终开启。

---

## 4. 数据与可观测

**为何页脚 "248 results" 与某处 1984 不一致**  
- 248 来自**透视表**（PivotTable，`pivotTableData.data.rowsCount`）；1984 来自**平表**（TableBody，`resultsData.totalResults`），是两张表。按列分组、多级列头的是透视表。

**如何判断虚拟化与是否加载完**  
看 `<tbody>` 的 data 属性：

| 属性 | 含义 |
|------|------|
| data-virtualized | 始终 `"true"`（行虚拟化常开）。 |
| data-rows-rendered | 视口+overscan 行数（未测量前可能为 0）。 |
| data-rows-loaded | 平表：已加载行数。透视表无。 |
| data-total-rows | 总结果数（即 "N results" 的 N）。 |

全部加载完：`data-rows-rendered` 与 `data-total-rows` 相等（平表看 data-rows-loaded）。

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

## 6. 后续可做（按优先级）

| 优先级 | 项 | 说明 |
|--------|----|------|
| 高 | ~~再降 overscan~~ | 曾降至 10/5 会导致快速滚动白屏，已恢复 25。 |
| 高 | ~~PivotTable 行 memo 或稳定 key~~ | **已做**：抽取 `PivotTableRow`（memo），用 `row.id` 作 key，行内对 `rowFields`、`cellFormatMap` 做 useMemo，ref 存 `getConditionalRuleLabelFromItem`。 |
| 高 | ~~透视表滚动仅 body 重渲染~~ | **已做**：抽取 `PivotTableBody`，useVirtualizer 仅在该组件内，滚动时表头/表尾不重渲染。 |
| 中 | ~~条形图懒加载~~ | **已做**：BarChartDisplay 内首帧仅文字，rAF 后再画条形，先出数据再出图。 |
| 中 | 条件格式跨行缓存 | **可选**：多行同 (field, value) 时收益大；需维护缓存失效（minMaxMap / conditionalFormattings 变化时清空），否则数据或配置变更后显示错误。 |
| — | **列虚拟化** | **不处理**。不考虑列虚拟化。 |
| 中 | 滚动 throttle/RAF | 合并更新频率（需测与 @tanstack/react-virtual 兼容性）。 |
| 中 | ~~升级 @tanstack/react-virtual~~ | **已做**：升级至 ^3.13（仅前端依赖），含 getTotalSize 等修复，利于透视表虚拟化。 |
| 中 | ~~条件格式用 useDeferredValue~~ | **已做**：PivotTableRow 内用 useDeferredValue(cellFormatMap)，React 可先出纯数据再应用底色，滚动时主线程更易响应。 |
| 中 | ~~useFlushSync: false~~ | **已做**：PivotTableBody 内 useVirtualizer 传 useFlushSync: false，滚动时不再 flushSync，由 React 批量更新。 |
| 低 | ~~tr 上 contain~~ | **已做**：平表 Tr 已加 `contain: paint`。 |
| 低 | Profiler 定位热点 | 录滚动看 TableRow / 条件格式 / BarChartDisplay 谁最吃时间。 |

**其他可优化点**（按需考虑）  
- **Context 拆分**：TableProvider 若包过多 state，可拆成只订阅「表格 body 所需」的 context，减少无关更新触发 TableBody 重绘。  
- **稳定回调引用**：fetchMoreRows、cellContextMenu 等通过 context 传入时用 useCallback 稳定引用，避免 TableRow memo 失效。  
- **will-change**：若已去掉（仅透视表），保留 contain: paint + overflow-anchor: none 即可；若仍觉卡顿可再试加回 will-change。

---

## 7. 快速滚动白屏/空白：原因与属性权衡

**现象**：快速滚动或滚到 overscan 区域时，可能出现大段空白、较久才渲染出来。

**可能原因**：

| 原因 | 说明 |
|------|------|
| 大量新行同时挂载、主线程被占满 | 快速滚动后新进入视口的行（含 overscan）一次性挂载。每行 PivotTableRow 的 useMemo（rowFields、cellFormatMap）会做大量条件格式计算，主线程占用，浏览器要等 React commit 后才 paint，表现为「空白很久才出来」。 |
| 滚动容器 will-change / 合成层 | `will-change: transform` 会单独合成一层；新滚入视口的内容要等该层更新后才绘制，可能加重「先空白再出现」。但去掉后透视表会明显卡顿。 |

**LightTable 滚动容器四个 CSS 的作用**：

| 属性 | 作用 |
|------|------|
| `overflow: 'auto'` | 允许横向/纵向滚动。 |
| `contain: 'paint'` | 绘制 containment：子元素只在本框内绘制、不溢出，浏览器可缩小重绘/合成范围，滚动时更省力。 |
| `will-change: 'transform'` | 提示“即将发生位移”，浏览器会提前把该节点升为**合成层**，滚动时用 GPU 做位移，减轻主线程重排；代价是新滚入视口的内容可能等合成层更新后才绘制，**容易出现“先空白/占位，稍晚才看到表格数据”**。 |
| `overflowAnchor: 'none'` | 关闭滚动锚定：虚拟化表格会频繁插入/删除 DOM 行，若开启锚定，视口可能被拽动；关掉后滚动位置由虚拟器自己控制。 |

**当前取舍（仅透视表）**：

- 若**已去掉 will-change**：保留 `contain: paint` + `overflow-anchor: none`，新内容更易随滚动及时出现；可配合升级 @tanstack/react-virtual、useDeferredValue 条件格式、条形图懒加载进一步减轻卡顿。
- 若**保留 will-change**：滚动更顺滑，但新滚入内容可能稍晚绘制；按设备体感二选一。
- **overscan 25** + **可见行优先计算**：优先行下一帧上色，其余延后；VirtualizedArea 占位浅灰。

**已做（减白屏体感 + 优先计算）**：

- **overscan 保持 25**（不再用 30）：配合可见优先计算，无需更大 overscan。
- **可见行优先计算**：PivotTableBody 按 virtualRows 取中间约 50% 为「优先行」；优先行在 requestAnimationFrame 下一帧算条件格式，其余行用 requestIdleCallback(timeout 32) 延后算。视口内行先上色，边缘 overscan 行稍晚上色。
- **VirtualizedArea 占位浅灰**：空白占位用浅灰背景，弱化纯白观感。

**为何「没有条形图和底色的表格数据」仍会延迟一会儿才展示**：

- 首帧逻辑已做到「先出数字、后出条形/底色」：条形图首帧只渲染文字，条件格式首帧为空 map。延迟主要来自：(1) **虚拟化**：新行只有在进入 overscan 范围时才会挂载，滚动后先出现的是占位高度，再是整行 DOM；(2) **will-change: transform**：滚动容器在单独合成层上，新滚入的内容要等该层更新后才绘制，观感上就是「先空白/浅灰占位，稍晚才看到数据」。
- 若更看重「随滚动实时看到纯数据」：可临时在 LightTable 去掉 `will-change: 'transform'` 做体感对比，新内容可能更早出现，但滚动流畅度可能下降，需按实际设备取舍。

**后续可做**（若仍觉白屏时间长）：

- **骨架行**：占位区或首帧用骨架行（shimmer/脉冲）替代纯色，进一步弱化白屏感。
- **按可见优先算格式**：~~首帧只对视口中心几行算~~ **已做**：virtualRows 中间约 50% 为优先行、rAF 下一帧算，其余 requestIdleCallback 延后。
- **Profiler 定位**：确认是挂载慢还是 paint 慢再针对性优化。

---

## 7.5 去掉 will-change 后的进一步优化与替代方案（仅透视表）

**已做（本轮）**：

- **升级 @tanstack/react-virtual**：^3.10 → ^3.13，含 getTotalSize 等修复，利于虚拟化稳定性。
- **条件格式 useDeferredValue**：PivotTableRow 内对 cellFormatMap 用 useDeferredValue，React 可优先渲染「纯数据」再应用底色，滚动时更新不阻塞主线程。
- 条形图懒加载、可见行优先计算、预计算/缓存等仍生效。

**还可尝试（仅透视表）**：

| 方向 | 说明 |
|------|------|
| **overscan 微调** | 当前 overscan 18；若边缘露白多可试 20～22。 |
| **条件格式 Worker** | **已做**：条件格式在 Web Worker 中算 backgroundColor/fontColor，主线程只补 tooltip；Worker 不可用时自动回退主线程。 |

**替代方案（渲染更快的组件/实现）**：

| 方案 | 说明 | 成本 |
|------|------|------|
| **react-virtuoso** | 另一套虚拟列表，TableVirtuoso 支持固定表头、语义化 table，部分场景下绘制策略不同、体感可能更顺。 | 需把透视表 body 从 useVirtualizer 改为 TableVirtuoso，列结构、sticky 表头需重对，中等改造成本。 |
| **Canvas 绘制表格** | 用 Canvas 只绘制可见区域单元格（文字 + 条形 + 底色），滚动时仅重绘视口，无大量 DOM，理论上滚动最跟手。 | 失去单元格 DOM：复制、右键菜单、链接、Tooltip 等需自实现；无障碍、可访问性要额外做；**改造成本高**，仅当 DOM 方案无法满足时考虑。 |
| **混合：Canvas 背景 + DOM 文字** | 底层 Canvas 画条形/底色，上层 DOM 只渲染文字与交互。 | 实现复杂，层级与事件要精细处理，收益需实测。 |

结论：优先在**当前 DOM + 虚拟化**下用「去掉 will-change + 升级 virtual + useDeferredValue + 条形图懒加载」把体感做到可接受；若仍不行再评估 react-virtuoso 或 Canvas（仅透视表，平表不动）。

---

## 8. 推荐 overscan 与透视表渲染优化

### 8.1 透视表 overscan 推荐

| 取值 | 适用场景 |
|------|----------|
| **25（当前）** | 配合可见行优先计算，视口内先上色，无需更大 overscan。 |
| **30** | 若仍觉边缘露白多，可试 30。 |
| **15～18** | 单次挂载更少，边缘露白更明显。 |

结论：**当前 25** + 可见优先计算；按体验可微调 overscan 或 priority 比例。

### 8.2 透视表渲染优化（已做与可选）

**已做**：

- **条件格式跨行缓存（相同数值/背景复用）**：`formatCacheRef` key = (fieldId, value, rowFields)；同值格复用同一份 backgroundColor/fontColor/tooltipContent，少重复计算。
- **延后算 + 可见优先**：首帧为 `{}` 先 paint。优先行在 rAF 中自算（写/读 formatCacheRef）；非优先行 requestIdleCallback 延后算。父级预计算已移除。

**复用的注意**：相同 (fieldId, value, rowFields) 仍走 formatCacheRef，多行同值只算一次；父级预计算已移除，每行在自身 effect 内调用 computeCellFormatMapForRow 并写入/读取 formatCacheRef。

**可选**（按需）：

| 优化 | 说明 |
|------|------|
| **tooltip 懒算** | cellFormatMap 里先不调 getConditionalFormattingDescription，tooltip 在 hover 时再算（需 Cell 支持异步 tooltip）。 |
| **Profiler 定位** | 录快速滚动确认瓶颈后再做针对性优化。 |

---

## 9. 涉及文件

- `TableBody.tsx` — 平表行虚拟化（**已恢复未改**）
- `Table.styles.ts` — 平表样式（**已恢复未改**）
- `BodyCell.tsx` — 平表单元格（**已恢复未改**）
- `PivotTable/index.tsx` — 透视表行虚拟化、PivotTableBody（隔离+缓存+预计算 precomputedMapRef+可见优先）、PivotTableRow（memo、预计算应用/缓存+延后算）、overscan: 25、VirtualizedArea 占位浅灰
- `LightTable/index.tsx` — 透视表滚动容器（contain + will-change + overflow-anchor）
- `useColumns.tsx`、`barChartDisplay.tsx` — 条件格式、柱状图
