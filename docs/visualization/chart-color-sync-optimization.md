# 看板颜色同步：确定性哈希 + 感知色差避让

> 更新时间：2026-11-19
> 状态：**已实施**（v2.7.5 期间曾整块回退，2026-11-19 修复根因后重新合入 dev）
> 本文只描述**当前生效**的语义。2026-09-20 之前的「访问顺序分配器 / 色差顺延」已废弃，
> 阈值 45/60（RGB 距离）也已被 CIEDE2000 口径取代，历史结论不再适用。

## 一、为什么废弃「按访问顺序分配颜色」

2026-03-25 引入过一版「Dashboard 级全局分配器 + 色差顺延」：按 `dashboardUuid` 隔离的模块级
`globalColorAssignments`，先到先得占色，撞色就顺延到下一个色。共用调色板 ≠ 系列同色：

| 旧机制 | 实际后果 |
|--------|----------|
| 先到先得 + 色差顺延 | 先打开的 Tab 占走「李子柒=紫」，后开的 Tab 发现紫色太近就顺延，同系列变色 |
| `ChartColorMappingContext` 按 pathname 重置 | URL 含 `/tabs/:tabUuid`，切 Tab 等于换路径，FCFS 表清空 |
| `globalColorAssignments` 从不 reset | 筛选后系列集合变了，顺延结果粘在旧访问顺序上 |

结论：跨 Tab 可靠要求颜色是 **系列名 + 调色板**（+ 已保存手配色）的**纯函数**，不能依赖
「谁先渲染」。因此改为确定性哈希：相同 identifier + 相同 palette 永远同色。

## 二、当前取色流水线

```
全部 Tab 的 chart tiles（含未访问 Tab）
        │
        ▼
useQueries 预取 saved_query → 收集系列名（extractColorSyncKeysFromChartConfig）
        │
        ▼
assignKnownHashColors：按共现分组（同一张图内的名字互斥）分配基准色
        │
        ▼
按本图容量重分配（assignVisibleChartColors，ECharts 通道）
        │  ① preferred 继承：基准色仍在当前色板且本图未占用 → 直接用（跨图同名同色）
        │  ② 哈希基准色：palette[hash(key) % len]，两趟避让（见下）
        │  ③ 超出容量：生成色（expandPalette / 色相候选 / 网格 max-min 兜底）
        ▼
createChartColorAllocator：色表未覆盖的运行期系列名现场分配（仍只在本图内避让）
```

自定义图表（Vega-Lite）注入的是**看板合并色表**（`colorSync.hashAssignments`），
不享受「本图容量重分配」，但度量与兜底规则与标准图共用。

### 两趟色板避让（`pickAvoidingColor` 主题色段）

1. 第 1 趟：从哈希起点线性探测，返回第一个「本图未用过**且**与已用色 ΔE00 ≥ `MIN_COLOR_DIFF`」的色板色；
2. 第 2 趟：仍无解时退回「任一无重复色板色」。

好处：只要本图系列数 ≤ 色板色数，**每条系列都拿色板原色**（用户选什么色板就画什么色），
同时能挡住色板里偶尔出现的近重复色。

## 三、度量与阈值（2026-11-19 起）

| 项 | 值 | 依据 |
|---|---|---|
| 色差度量 | **CIEDE2000**（`colorDifference`，sRGB→Lab(D65)，带 Lab 缓存） | RGB 欧氏距离与人眼判断脱节：`#00FF00/#00FF40` 是 ΔE00 2.52 但 RGB 64，两个旧阈值都放过 |
| `MIN_COLOR_DIFF` | **12** | 20 色纯霓虹色板两两 ΔE00 上限实测 12.56，取 12 才能保住「容量内全用色板色」 |
| `MIN_GENERATED_COLOR_DIFF` | **15** | 同色相明暗变体多落在 ΔE00 2.1–13，15 能挡住「看起来一样」的变体 |
| 兜底阶梯 | 已用色 <40 → 12；40–79 → 8；≥80 → 5 | 候选互相挤占时优先延迟（而不是质量），任何档位都**不返回 ΔE < 5** 的颜色 |
| 兜底搜索 | 216 静态网格（24 色相 × 3 饱和 × 3 明度）的 max-min + 细搜 | 旧的「只要求不重复」兜底会产出 ΔE00 0.2 的两条线 |

生成色策略：`expandPalette` 每基色 **2 个变体且色相错开**；`hueCandidateAt` 的 30° 步进只保留
前 11 个（第 12 个是 360° 回绕，与基色 ΔE00 仅 2.1–4.1）；黄金角分支的饱和度/明度依赖基色，
避免不同基色收敛到同一格。

## 四、容量口径（这是 11-18 那版仍未收敛的根因）

`visibleColorKeys` 必须与「**真正会渲染**的系列」对齐：

- 看板侧 `computedSeries` 来自 `mergeExistingAndExpectedSeries`，会保留同一 field 分组下
  已不在当前结果里的历史 pivot 系列并标记 `isFilteredOut`（渲染时被剔除）；
- 这类 stale 系列若计入容量，会挤占色板 → 真正渲染的系列被推到生成色。

实测（卡夫亨氏看板）：`window.__msyColorSync` 显示 `visibleKeys = 147`，真正渲染只有十几条
（147 个 key 里包含「(永叔公)290g土磨坊麻油白腐乳」这类与「类目=酱油」过滤完全矛盾的历史品种）。
147 个 key 吃光 20 色板 + 扩展变体后落进旧兜底，产出 `#ebec13` / `#eceb13`（RGB 相距 1.4）。

修复：`collectVisibleColorKeys`（`components/LightdashVisualization/collectVisibleColorKeys.ts`）
只统计过滤掉 `isFilteredOut` 的系列，`pivotDetails` 补齐共用同一个 Set 去重；DEV 下
`window.__msyColorSync` 暴露 `renderedSeriesCount` / `skippedFilteredOutCount`，容量口径漂移会
`console.warn`。

## 五、色板规格（2026-11-19 起统一）

「一个色系一个色」是业务要求（赤橙黄绿蓝靛紫 + 黑 + 灰）。按人眼 30° 一档只能切出 12 个色系，
加黑 + 灰 **最多 14 色**——想同时要「20 色」和「一色系一色」在感知上不可能（20 色里必然有 6 个
与别人同族，正是此前「蓝色太接近 / 紫色太接近」的来源）。

因此：**除图表默认（ECharts 原生 9 色）外，所有预设一律 14 色**（弹层每行色块数一致）。

| 预设 | 色数 | 两两最小 ΔE00 |
|---|---|---|
| 图表默认 echarts | 9 | 15.0 |
| 标准预设 default | 14 | 19.6 |
| 现代风格 modern | 14 | 17.9 |
| 复古风格 retro | 14 | 14.2 |
| 商务风格 business | 14 | 9.6（单色系深浅是设计本意） |
| 品牌色 lightdash | 14 | 17.9 |
| 数据矩阵 dataMatrix | 14 | 20.0 |

**旧色板迁移**：看板把选中的色板以**色值数组**存进 `dashboard.config.colorPalette`，改色值不会自动
生效。`reconcileColorPalette`（`pages/palettePresets.ts`）在读路径把命中某预设 `legacyColors` 的
色板换成当前 `colors`，用户下次保存后落库；`matchesColorPalette` 用同一套历史值列表保证弹层
「当前选中」态不丢。**以后改任何预设色值，必须把旧值追加进该预设的 `legacyColors`。**

## 六、已知限制（设计边界，不是 bug）

1. **容量 14 是「一色系一色」的物理上限**。系列数 > 14 时超出部分用生成色：与色板任意色
   ΔE00 ≥ 12，但「线不是色板里的色」。实测 14/20/30 系列图内最小 ΔE00 分别 18.6 / 15.7 / 12.5。
2. **跨图同名同色在超容量时会退化**：某图系列数 > 色板容量时以「本图可读性优先」重分配，
   可能与其它图同名不同色。实测 14 系列 × 3 Tab 完全一致；25 系列图有 2 个名字与别图不一致。
3. **单色系预设仍是最弱环**：现代/复古/商务的下限 17.9 / 14.2 / 9.6，系列多了靠生成色兜。
4. **自定义图（Vega-Lite）** 走看板合并表，不享受本图容量重分配（同名同色靠确定性哈希保证）。
5. **未勾选同步的图不跟随看板调色板**：各图用各自的 `chartPalette`（设计如此）。
6. **看板级避让会拥挤**：运行期新增的名字按「整块看板已用色」避让，图很多时色差被挤到阶梯低位
   （≥5）。要根治需持久化追加表（涉及 `DashboardConfig` 类型与迁移）。
7. **瞬态不一致**：名字要等 `useLayoutEffect` 注册进看板表后才统一；首帧由各图自算（React 在
   paint 前同步 flush，通常不可见，未做浏览器实测）。

## 七、同步范围

- 只有**勾选进白名单**（`dashboard.config.syncChartTileUuids`）的 tile 参与同步：
  `useHashBased = syncChartColors && syncChartTileUuids.includes(tileUuid)`。
- 参与按系列名取色的类型：**标准图表（CARTESIAN）/ 饼图 / 自定义图表（Vega-Lite）**。
  表格、指标卡、数据应用无颜色语义；漏斗/树图只把色板当位置色数组用。
- **SQL 图表不参与**（不经过 `VisualizationProvider`，配色走组织色板）。
- 分母/分子口径：弹层「已同步 N / M」中 M 是「有标题的 saved-chart tile 数」。

## 八、核对入口

| 用途 | 位置 |
|---|---|
| 本图取色 + 容量口径 | `VisualizationProvider.tsx` 的 `chartHashAssignments` / `collectVisibleColorKeys` |
| 看板级基准色、运行期追加 | `providers/DashboardChartColorSync/DashboardChartColorSyncProvider.tsx` |
| 避让算法与阈值 | `hooks/useChartColorConfig/hashColorAssignment.ts`（`pickAvoidingColor` / `expandPalette` / `hueCandidateAt` / `gridFallback`） |
| 色板与旧值对账 | `pages/palettePresets.ts`（`colors` / `legacyColors` / `matchesColorPalette` / `reconcileColorPalette`） |
| DEV 诊断 | 浏览器控制台 `window.__msyColorSync`（`paletteSize` / `visibleKeys` / `renderedSeriesCount` / `skippedFilteredOutCount` / `misses`） |

聚焦测试：`pages/palettePresets.test.ts`、`hooks/useChartColorConfig/hashColorAssignment.test.ts`、
`components/LightdashVisualization/collectVisibleColorKeys.test.ts`。
