# 看板颜色同步：废弃色差顺延

> 更新时间：2026-11-18
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
4. `syncChartTileUuids` 是严格白名单：只同步勾选的 tile；为空时没有任何图表参与同步

## 补充（2026-11-17）：兜底唯一性、容量上限与已知限制

这一节记录当前真实语义，避免后续把「近似色」当成 bug 反复返工。

### 已修：候选耗尽不再返回冲突色

`pickAvoidingColor` 的候选顺序是「主题色板 → 扩展色（每色 3–4 个同色相明暗变体）→ 色相旋转」。
历史上候选耗尽后**直接返回上一轮的冲突色**，导致同图出现完全相同的颜色（用户反馈「黄色出现 3 次」即此）。
现在：第 13 个候选起用黄金角 137.5° 扩色相空间；仍找不到满足色差的候选时**唯一性优先**，
只要求「不与已用色完全相同」，因此同图不会再有重复色值。

### 调色板优先（2026-11-17 起）

主题色板里的颜色**按原样使用**，不再按色差阈值跳过：

- 只要系列数 ≤ 调色板去重后的颜色数，每个系列都拿到色板里的原始颜色，同图内两两不同
- 单色系色板（商务风格 / 复古风格 / 现代风格）会渲染成一串相近色——这是色板的设计意图
- 只有系列数超过色板容量时，才用生成色补足（生成色仍按 `MIN_*_COLOR_DIFF` 避让）
- 完全相同的颜色不会被重复分配（先按精确值去重）

### 阈值分层与容量上限

- 主题色板仍按 `MIN_COLOR_DIFF = 45` 使用；生成色（扩展色 / 色相旋转）要求 `MIN_GENERATED_COLOR_DIFF = 60`
- 60 的**有效容量约 16–19 色**：看板已用色 ≥ `GENERATED_DIFF_CAPACITY = 20` 时自动降级回 45，
  否则会提前耗尽候选、掉进唯一性兜底，图内色差反而更差（实测 known=30 时 29.3，降级后 ≈45）
- 实测：15 系列在 `usedColors < 20` 时最小色差 60；≤9 系列（未超色板长度）的颜色与阈值调整前逐项一致

### 已知限制（不是 bug，是当前设计的边界）

1. **按本图容量分配 + 跨图尽量同色**（2026-11-18 终稿，经历两轮反复）
   - 口径：`assignVisibleChartColors()` 只看**本图可见系列**——系列数 ≤ 调色板去重色数时，每条系列
     都拿到调色板原色且两两不同；只有本图自己超过容量时才用生成色
   - 已保存系列的基准色从 `knownHashAssignments` 继承（本图无冲突时与原看板色一致）；
     基准色**不属于当前调色板就丢弃**，所以切换调色板会立即全部换成新调色板的色
   - 跨图同名同色由「哈希基准色确定性 + preferred 继承」保证；若两个名字在本图
     拞到同一色，后者会换到本图未用的调色板色——此时该名字跨图可能不同色（以本图可读性优先）
   - 两轮历史：11-17 改为「按本图避让」→ 同名跨图不同色（本图 9 条却拿不到调色板色）；
     11-18 上午改回「整板唯一」→ 整板名字一多（如 40 个商品名）就把 20 色挤满，
     本图 9 条线也变成调色板外的生成色。两个都只对了一半，故收敛为「本图容量内保证调色板保真 + 不重复，
     跨图尽量一致」
   - 自定义图表（Vega）仍用看板合并表（`appendDashboardUnknownHashColors`），暂未跟进本图口径
2. **跨图同色不是硬保证**：名字特别多的看板（本图同现名字 > 调色板色数）会出现同图撞色，
   撞色时后者被改到本图未用色，于是同名在不同图里可能不同色
2. **瞬态不一致**：名字要等 `useLayoutEffect` 注册进看板表后才统一；首帧与 `known` 重置帧由各图自算，
   理论上可出现短暂不同色（React 在 paint 前同步 flush，通常不可见，未做浏览器实测）
3. **运行期未知名依赖挂载顺序**：看板追加表仍按「先注册先占色」累加（Vega 通道在用），
   但目前 ECharts 通道已不消费该表，只以 `knownHashAssignments` 作 preferred 基准，
   因此对本图取色不再受挂载顺序影响
4. **调色板预设色值一旦清洗，旧看板的选中态需要 legacy 兼容**：弹层选中态是整串精确比较，
   预设色值变动后旧保存值不再匹配（2026-11-17 `dataMatrix` 换了 5 个近重复色就踩过）。
   现在用 `palettePresets.ts` 的 `matchesColorPalette()` 做归一化比较（小写 / 去空白 / 去重），
   并用 `legacyColors` 登记历史色串；**以后改任何预设色值都必须同步补 `legacyColors`**

### 改动入口（排查用）

| 行为 | 代码位置 |
|---|---|
| 本图取色（按本图容量分配） | `VisualizationProvider.tsx` 的 `chartHashAssignments`（`assignVisibleChartColors`） |
| 看板级基准色 | `DashboardChartColorSyncProvider.tsx` 的 `assignKnownHashColors`（`knownHashAssignments`） |
| 看板级追加（Vega 通道在用） | `registerVisibleColorKeys` → `appendDashboardUnknownHashColors` |
| 避让算法与阈值 | `pickAvoidingColor` / `MIN_*_COLOR_DIFF` / `GENERATED_DIFF_CAPACITY` |
| 调色板选中态识别 | `palettePresets.ts` 的 `matchesColorPalette` + `legacyColors` |
