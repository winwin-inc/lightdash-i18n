# 多图表图例颜色同步方案

> 更新时间：2026-09-20
> 相关演进见 [chart-color-sync-optimization.md](./chart-color-sync-optimization.md)

## 背景

看板里同一系列名（品牌、类目、口味等）在柱图、饼图、不同 Tab 上颜色不一致：

1. **顺序分配**：未开同步时按系列到达顺序从调色板取色
2. **路径隔离**：`ChartColorMappingContextProvider` 按 URL pathname 重置；切 Tab（`/tabs/:tabUuid`）等于换路径
3. **旧哈希 + 色差顺延**：依赖访问顺序，跨 Tab / 筛选会改色（已废弃，见 optimization 文档）
4. **柱图 vs 饼图**：hash 模式曾跳过饼图 `groupColorOverrides`，柱图却仍吃 `metadata.color`

## 需求

开启「同步图表颜色」后：

- 同一系列名在透视柱图、饼图、**任意 Tab**（含未访问 Tab）颜色一致
- 不依赖先打开哪个 Tab
- 筛选增减系列后，已有系列颜色不变
- CUSTOM (Vega-Lite) 不走这套，保持自身配色
- 可按 tile 勾选哪些图参与同步

## 当前取色优先级（开启同步后）

1. **看板系列色表** `manualColorMap`：从全部 Tab 已保存图表收集的手配色（饼图切片色、透视柱图系列色），按看板 **tile 顺序 first-wins**
2. **模型字段** `dimension.colors`（dbt YAML）
3. **确定性哈希** `assignKnownHashColors` / `resolveSyncedHashColor`：对已保存配置里的系列名排序后哈希并避让撞槽；筛选新出现的系列只追加，不改 known

系列名会归一：`其他品牌：包含494个` → `其他品牌`。柱图图例和饼图切片能对上。适用于品牌、类目、口味等任意透视/切片维度值。

看板主题色（编辑态 Colors 预设 → `dashboard.config.colorPalette`）只做第 3 步的哈希定义域，不做访问顺序占色。缺省回落到组织 `chartColors` 或 ECharts 默认色。

关闭同步时：各图仍用自己的 `series.color` / metadata / 顺序调色板（见 [chart-color-generation-fix.md](./chart-color-generation-fix.md)）。

## 跨 Tab 如何保证

进入看板即按 tile 稳定顺序预取**全部 Tab** 的 `saved_query`（`useDashboardColorSyncMap`），不依赖当前访问过哪些 Tab。

编辑态开关通过 `DashboardChartColorSyncProvider` 的 props 覆盖已保存配置，立即生效。Embed / Minimal 看板走 `DashboardProvider` 外包的同一 Provider（读已保存 config）。

`ChartColorMappingContext` 的 pathname 重置仍存在，但同步路径不再读那张 FCFS 表。

## 配置

存在 `dashboard_versions.config`（JSONB），无需新迁移。

```typescript
// DashboardConfig
syncChartColors?: boolean;      // 开关，默认关
colorPalette?: string[];        // 看板主题调色板
syncChartTileUuids?: string[];  // 需要同步的 tile；空 = 全部非 CUSTOM 图
```

UI：看板编辑态工具栏 Switch「同步图表颜色」+ Colors 预设 + 图表勾选列表。

## 实现状态

#### 已完成

- [x] `DashboardConfig`：`syncChartColors` / `colorPalette` / `syncChartTileUuids`
- [x] UI 开关、主题色预设、按图表勾选
- [x] 跳过 CUSTOM
- [x] 全 Tab 预取 + 系列色表 + 确定性哈希避让
- [x] 柱图 / 饼图同步路径统一读系列色表；hash 模式忽略当前图 metadata 顺序色
- [x] 编辑态开关即时预览

#### 明确不做 / 边界

- **未透视单系列柱图**（维度值在 X 轴、整图一个 series）：无法按柱子上系列色，这是系列着色模型限制，不是 Tab 问题
- 漏斗 / Treemap / Vega 不走 VisualizationProvider 这套查找
- 同一系列名在多张图手配了不同颜色：以看板 tile 顺序**第一张**为准
- 手配了相同色的两个系列名，避让不会拆开（那是用户/旧保存色）

## 关键文件

| 文件 | 职责 |
|------|------|
| `packages/common/src/types/dashboard.ts` | `syncChartColors` / `colorPalette` / `syncChartTileUuids` |
| `packages/frontend/src/hooks/useChartColorConfig/colorSyncKeys.ts` | 系列名同步键、收集手配色、合并 |
| `packages/frontend/src/hooks/useChartColorConfig/useDashboardColorSyncMap.ts` | 预取全部 Tab 图表配置 |
| `packages/frontend/src/hooks/useChartColorConfig/hashColorAssignment.ts` | 确定性哈希避让 |
| `packages/frontend/src/hooks/useChartColorConfig/useChartColorConfig.tsx` | 同步时走 `resolveSyncedHashColor`；关闭同步时仍走顺序分配 |
| `packages/frontend/src/providers/DashboardChartColorSync/` | 看板级系列色 context |
| `packages/frontend/src/components/LightdashVisualization/VisualizationProvider.tsx` | `getSeriesColor` / `getGroupColor` |
| `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` | 读 context，传入 `useHashBased` + `manualColorMap` |
| `packages/frontend/src/pages/Dashboard.tsx` | 编辑态开关 / 调色板 / 图表勾选，内层 Provider 做即时预览 |

## 验证方式

1. **同看板多图**：透视柱图与饼图同名系列同色
2. **跨 Tab**：先打开从未访问的 Tab，颜色应与其他 Tab 已出现的系列一致
3. **筛选**：增减系列后，已有系列颜色不变
4. **编辑器 vs 看板**：图表里手配的透视 / 饼图色应出现在系列色表中并在看板复用
5. **开关关闭**：行为回到各图自己的顺序色 / 保存色
6. **图表勾选**：`syncChartTileUuids` 非空时，未勾选图不走同步

## 常见问题

### Q1: 颜色从哪里来？

- **组织**：`chartColors`（看板未设 palette 时的回落）
- **看板主题色**：`config.colorPalette`（开启同步后的哈希定义域）
- **图表手配**：饼图 `groupColorOverrides`、透视柱图 `series.color` / metadata，预取后进入系列色表
- **dbt**：`dimension.colors`

### Q2: 需要用户手动画系列映射吗？

不必。开启同步即可。若某系列名在任一同步图表里手配过色，全看板跟这份色；否则哈希并避让。

### Q3: `useHashBased` 是什么？

内部参数。tile 在 `shouldSyncColors` 为 true 时传给 `VisualizationProvider`。用户只操作「同步图表颜色」开关。

### Q4: 主题色是不是丢了？

没有。坏的是旧方案用主题色做访问顺序分配。现在主题色只参与哈希。

## 潜在影响

1. 特性默认关闭，未开同步的看板不受影响
2. 曾经依赖色差顺延的看板，开启同步后颜色可能与 3 月方案不同（更稳定，但不再「顺延拉开」）
3. 开启 / 改调色板 / 改勾选后需保存看板才会持久化；编辑态预览不必先保存
