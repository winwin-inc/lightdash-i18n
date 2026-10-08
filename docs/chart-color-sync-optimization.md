# 看板颜色同步：废弃色差顺延

> 更新时间：2026-09-20
> 状态：按访问顺序的 `getGlobalHashColor` **已删除**，改为全 Tab 预取系列色表 + 确定性哈希避让

## 旧方案在解决什么

2026-03-25 引入「Dashboard 级全局分配器 + 色差保障」，目标是：

1. 同一 identifier 跨图表同色
2. 不同 identifier 颜色差够大（筛选后避免相邻系列撞色）
3. 用看板主题调色板（`colorPalette`）做分配域

核心是模块级 `globalColorAssignments`：按 `dashboardUuid` 隔离，先到先得占色；新系列若与已用色 `colorDifference < MIN_COLOR_DIFF`，则顺延到下一个色。

## 为何废弃

色差顺延用主题色做**访问顺序分配器**，共用调色板 ≠ 系列同色。

| 旧机制 | 实际后果 |
|--------|----------|
| 先到先得 + 色差顺延 | 先打开的 Tab 占走「李子柒=紫」，后打开的 Tab 发现紫色太近就顺延，同系列变色 |
| `ChartColorMappingContext` 按 pathname 重置 | URL 含 `/tabs/:tabUuid`，切 Tab 等于换路径，FCFS 表清空 |
| 柱图 hash 模式仍读 `metadata.color`，饼图 hash 模式跳过 `groupColorOverrides` | 编辑器里手配色到看板上柱图 / 饼图对不上 |
| `globalColorAssignments` 从不 reset | 筛选后系列集合变了，顺延结果粘在旧访问顺序上 |
| `resetDashboardColorAssignments` 从未被调用 | 跨路由残留状态 |

跨 Tab 可靠要求颜色是 **系列名 + 调色板 + 已保存手配色** 的纯函数，不能依赖「先看到哪张图」。适用于品牌、类目、口味等任意透视/切片维度值。

因此删除：

- `getGlobalHashColor`
- `colorDifference` / `MIN_COLOR_DIFF`
- `globalColorAssignments` / `resetDashboardColorAssignments`
- `VisualizationProvider` 的 `dashboardUuid` 占色隔离

保留 FNV-1a `getHashColor`（扩展调色板后取模），相同 identifier + 相同 palette 永远同色。

## 当前流水线

```
全部 Tab 的 chart tiles
        │
        ▼
useQueries 预取 saved_query（含未访问 Tab）
        │
        ▼
extractManualColorsFromChartConfig / extractColorSyncKeysFromChartConfig
  · 饼图 groupColorOverrides / metadata
  · 透视柱图 series.color / metadata（跳过指标名键）
        │
        ▼
按看板 tile 顺序 first-wins 合并 → manualColorMap
按 UTF-16 排序分配 → hashAssignments（确定性避让）
        │
        ▼
取色：manualColorMap → dimension.colors → resolveSyncedHashColor
```

主题色（编辑态 Colors 预设，写入 `dashboard.config.colorPalette`）**仍在**：只作为哈希定义域，不再按访问顺序占坑。未手配色的系列落在该调色板（或组织色 / ECharts 默认色）上。

### 关键文件

| 文件 | 职责 |
|------|------|
| `hooks/useChartColorConfig/colorSyncKeys.ts` | 系列名归一、从图表配置收集手配色、按 tile 顺序合并 |
| `hooks/useChartColorConfig/useDashboardColorSyncMap.ts` | 预取全部同步图表的 `saved_query` |
| `providers/DashboardChartColorSync/` | 看板级 context；编辑态开关可即时覆盖已保存配置 |
| `VisualizationProvider.tsx` | `getSeriesColor` / `getGroupColor` 共用查找；hash 模式忽略当前图 metadata 顺序色 |
| `hooks/useChartColorConfig/useChartColorConfig.tsx` | 仅保留纯函数 `getHashColor` |

## 取舍

- **换来的**：跨 Tab / 跨图表 / 筛选后，同系列颜色稳定
- **放弃的**：按访问顺序拉开色差。两个不同系列仍可能手配成同色；哈希撞槽则在稳定集合上确定性避让，不再依赖谁先渲染

## 验证

1. 开启「同步图表颜色」后，先打开未访问过的 Tab，再对比柱图与饼图同名系列是否同色
2. 改筛选后，已出现过的系列颜色不应被打乱
3. 编辑态打开开关应立即生效，不必先保存
4. `syncChartTileUuids` 为空时同步全部非 CUSTOM 图；非空时只同步勾选的 tile
