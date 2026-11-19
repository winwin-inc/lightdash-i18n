# 看板颜色同步：废弃色差顺延

> 更新时间：2026-11-19
> 状态：**已实施**（v2.7.5 曾整块回退，2026-11-19 在 `fix/chart-color-sync` 修复根因后重新合入）。
> 按访问顺序的 `getGlobalHashColor` 已删除，改为全 Tab 预取系列色表 + 确定性哈希避让。
> **本文下半部分（2026-09-20 及更早）里的阈值与容量口径已被 2026-11-19 的改造取代，
> 以「2026-11-19 现状」一节为准。**

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
4. `syncChartTileUuids` 是严格白名单：只同步勾选的 tile；为空时没有任何图表参与同步

## 补充（2026-11-17）：兜底唯一性、容量上限与已知限制

这一节记录当前真实语义，避免后续把「近似色」当成 bug 反复返工。

### 已修：候选耗尽不再返回冲突色

`pickAvoidingColor` 的候选顺序是「主题色板 → 扩展色（每色 3–4 个同色相明暗变体）→ 色相旋转」。
历史上候选耗尽后**直接返回上一轮的冲突色**，导致同图出现完全相同的颜色（用户反馈「黄色出现 3 次」即此）。
现在：第 13 个候选起用黄金角 137.5° 扩色相空间；仍找不到满足色差的候选时**唯一性优先**，
只要求「不与已用色完全相同」，因此同图不会再有重复色值。

### 阈值分层与容量上限

- 主题色板仍按 `MIN_COLOR_DIFF = 45` 使用；生成色（扩展色 / 色相旋转）要求 `MIN_GENERATED_COLOR_DIFF = 60`
- 60 的**有效容量约 16–19 色**：看板已用色 ≥ `GENERATED_DIFF_CAPACITY = 20` 时自动降级回 45，
  否则会提前耗尽候选、掉进唯一性兜底，图内色差反而更差（实测 known=30 时 29.3，降级后 ≈45）
- 实测：15 系列在 `usedColors < 20` 时最小色差 60；≤9 系列（未超色板长度）的颜色与阈值调整前逐项一致

### 已知限制（不是 bug，是当前设计的边界）

1. **看板级避让会拥挤**：运行期新增的名字按「整块看板已用色」避让（`appendDashboardUnknownHashColors`），
   图很多、每图十几个运行期系列时（如 30 known + 45 未知名），单图色差会被挤到 15–45。
   要根治需改为「只避让同图共现的邻居」，代价是不同的两个名字可能跨图撞色——属产品取舍，单独评估
2. **瞬态不一致**：名字要等 `useLayoutEffect` 注册进看板表后才统一；首帧与 `known` 重置帧由各图自算，
   理论上可出现短暂不同色（React 在 paint 前同步 flush，通常不可见，未做浏览器实测）
3. **运行期未知名依赖挂载顺序**：`known` 变化会重置追加表，已有未知名可能被重新分配颜色；
   要彻底消除需持久化追加表（涉及 `DashboardConfig` 类型与迁移）

### 改动入口（排查用）

| 行为 | 代码位置 |
|---|---|
| 同图取色 + 本图避让 | `VisualizationProvider.tsx` 的 `chartHashAssignments`（`appendUnknownHashColors`） |
| 看板级追加 | `DashboardChartColorSyncProvider.tsx` 的 `registerVisibleColorKeys` |
| 避让算法与阈值 | `hashColorAssignment.ts` 的 `pickAvoidingColor` / `MIN_*_COLOR_DIFF` / `GENERATED_DIFF_CAPACITY` |


## 2026-11-19 现状（以本节为准）

### 为什么 11-18 那版仍不收敛

看板实测 `window.__msyColorSync` 为 `visibleKeys = 147 / paletteSize = 20`，而真正渲染只有
十几条系列：`computedSeries` 会保留同一 field 分组下已不在结果里的历史 pivot 系列
（`isFilteredOut`，渲染时被剔除）并计入容量。147 个 key 吃光 20 色调色板与扩展变体后落进
「只要求不重复」的兜底，产出 `#ebec13` / `#eceb13`（RGB 相距 1.4）这类肉眼同色的线。

### 变量与口径（新）

| 项 | 旧（≤2026-11-18） | 新（2026-11-19） |
|---|---|---|
| 色差度量 | RGB 欧氏距离 | **CIEDE2000**（`colorDifference`，导出签名不变，hex→Lab 有缓存） |
| 阈值 | `MIN_COLOR_DIFF=45` / `MIN_GENERATED_COLOR_DIFF=60` | **12 / 15**（20 色纯霓虹 ΔE 上限实测 12.56） |
| 本图容量口径 | `computedSeries` + `pivotDetails` 全量（含 stale 系列） | 只统计**真正渲染**的系列（过滤 `isFilteredOut`）+ `pivotDetails` 去重（`collectVisibleColorKeys`） |
| 主题色避让 | 只跳过「完全相同」 | 两趟：先取与已用色 ΔE ≥ 12 的调色板色，无解才退回「任一无重复调色板色」（容量内仍只出色板原色） |
| 生成色 | 每基色 4 个同色相明暗变体；`hueCandidateAt` 第 12 候选 360° 回绕 | 每基色 2 个变体且色相错开；`LEGACY_HUE_STEPS=11`；兜底改 216 网格 max-min + 阶梯阈值（<40→12、40–79→8、≥80→5，**永不 < 5**） |
| 色板规格 | 20 色（含同族近重复：蓝 5 个、紫 3 个） | **除图表默认（ECharts 9 色）外一律 14 色** = 12 色系各 1 + 黑 + 灰，两两 ΔE00 ≥ 18.6；数据矩阵 14 色 ≥ 20.0 |
| 旧色板迁移 | 无 | `reconcileColorPalette` 读路径对账：命中 `legacyColors` 的已保存看板自动换成当前色值（保存后落库） |

### 已知限制（2026-11-19）

1. **容量 14 是「一色系一色」的物理上限**（12 色系 + 黑 + 灰）。系列数 > 14 时超出部分用生成色补足：
   与色板任意色 ΔE ≥ 12，但「线不是色板里的色」（14/20/30 系列实测图内最小 ΔE 分别 18.6 / 15.7 / 12.5）。
2. **跨图同名同色在超容量时会退化**：某图系列数 > 色板容量时以「本图可读性优先」重分配，
   可能与其它图同名不同色（实测 14 系列 × 3 Tab 完全一致；25 系列图有 2 个名字与别图不一致）。
3. **单色系预设（现代/复古/商务）仍是最弱环**：深浅梯度是设计本意，实测两两 ΔE00 下限
   17.9 / 14.2 / 9.6，系列多了靠生成色兜。
4. **自定义图表（Vega-Lite）走看板合并表**，不享受「本图容量重分配」，但共用同一套度量与兜底规则。

### 核对入口

- DEV 控制台：`window.__msyColorSync`（`useHashBased` / `paletteSize` / `visibleKeys` /
  `renderedSeriesCount` / `skippedFilteredOutCount` / `misses`）；`visibleKeys` 明显多于
  `renderedSeriesCount` 时会 `console.warn` 提示容量口径漂移
- 测试：`palettePresets.test.ts`（14 色规格、色族上限、ΔE 闸门、legacy 对账）、
  `hashColorAssignment.test.ts`（147/240 系列回归、两趟色板、确定性）、
  `collectVisibleColorKeys.test.ts`（147→14 容量口径）
