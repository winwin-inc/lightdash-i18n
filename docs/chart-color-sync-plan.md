# 多图表图例颜色同步方案

> 更新时间：2026-03-20

## 背景

Lightdash 中存在多个图表图例颜色不一致的问题：

1. **单独图表 vs 仪表板**：单独查看图表时使用组织默认颜色，仪表板中使用图表保存的 colorPalette
2. **不同图表间**：相同维度值在不同图表中显示不同颜色（按加载顺序分配颜色）
3. **页面切换**：按 URL 路径隔离颜色映射，切换页面后颜色可能变化

## 问题分析

### 当前逻辑

颜色分配在 `useChartColorConfig.tsx` 中实现：

```
colorMappings[group][identifier] = 递增索引
```

- `group`: 通常是表或模型名称（如 `customer`）
- `identifier`: 维度值（如分类名、城市名）
- 颜色索引按**到达顺序**分配，先到的先得

### 问题根源

1. **顺序依赖**：颜色索引依赖图表内字段的出现顺序
2. **路径隔离**：`ChartColorMappingContextProvider` 按 URL 路径重置颜色映射
3. **来源不同**：Dashboard 和单独查看使用不同 colorPalette

## 需求澄清

### Q: CUSTOM (Vega-Lite) 图表需要处理吗？

**不需要**。CUSTOM 图表类型是 Vega-Lite 自定义图表，它有自己独立的颜色配置系统，不走 VisualizationProvider 的颜色分配逻辑。因此：
- 颜色同步功能会**自动跳过** CUSTOM 类型的图表
- 这类图表保持原有的颜色配置方式

### Q: 需要选择哪些图表应用同步吗？

**需要**。目前实现中所有非 CUSTOM 图表都会应用颜色同步，但理想情况下用户应该能够：
1. 按图表**类型**选择：哪些图表类型（Cartesian、Bar、Line 等）应用同步
2. 按**具体图表**选择：哪些图表需要应用同步

**当前实现**：所有非 CUSTOM 图表统一应用
**待实现**：可配置的图表选择机制

## 解决方案：看板级别特性开关 + 哈希颜色分配

### 设计思路

1. **看板级别特性开关**：在 `DashboardConfig` 中添加 `syncChartColors` 配置项
2. **透传颜色**：开启特性后，看板内所有图表共享同一个 colorPalette 来源
3. **稳定颜色**：使用哈希代替顺序分配，相同维度值获得相同颜色
4. **跳过特殊图表**：自动跳过 CUSTOM (Vega-Lite) 类型图表

### 当前实现状态

#### ✅ 已完成

- [x] DashboardConfig 添加 `syncChartColors` 和 `colorPalette` 配置项
- [x] 哈希函数实现
- [x] 颜色统一使用看板的 colorPalette
- [x] 自动跳过 CUSTOM (Vega-Lite) 图表
- [x] UI 开关 + 颜色选择器（基础版）

#### ⏳ 待实现

- [ ] **图表选择机制**：用户可以选择哪些图表/图表类型应用颜色同步
- [ ] **更多预设颜色**：添加更多颜色预设选项

### 实现步骤

#### 步骤 1：在 DashboardConfig 中添加配置项

文件：`packages/common/src/types/dashboard.ts`

```typescript
export type DashboardConfig = {
    pinnedParameters?: string[];
    isDateZoomDisabled: boolean;
    tabFilterEnabled?: Record<string, boolean>;
    isGlobalFilterEnabled?: boolean;
    showGlobalAddFilterButton?: boolean;
    showTabAddFilterButton?: Record<string, boolean>;
    // 新增：看板颜色同步特性
    syncChartColors?: boolean;
    // 新增：看板级别的颜色调色板
    colorPalette?: string[];
};
```

**存储位置**：`dashboard_versions.config` (JSONB 字段)
- 后端已有迁移：`20241210085639_add_dashboards_config_jsonb.ts`
- **无需额外迁移**，直接在现有 JSONB 结构中添加字段

#### 步骤 2：透传 colorPalette 到看板所有图表

文件：`packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx`

修改：当 `dashboardConfig.syncChartColors` 开启时，统一使用看板的 colorPalette。
自动跳过 CUSTOM (Vega-Lite) 类型图表。

#### 步骤 3：添加哈希函数

文件：`packages/frontend/src/hooks/useChartColorConfig/useChartColorConfig.tsx`

```typescript
/**
 * 将字符串哈希为稳定数字，用于确定性颜色分配
 */
const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash);
};
```

#### 步骤 4：修改颜色分配逻辑（支持特性开关）

修改 `calculateKeyColorAssignment` 函数，支持两种模式：

```typescript
const calculateKeyColorAssignment = useCallback(
    (group: string, identifier: string, useHashBased: boolean = false) => {
        if (!identifier || identifier === 'null') {
            return theme.colors.gray[6];
        }

        let colorIndex: number;

        if (useHashBased) {
            // 哈希模式：相同 identifier 获得相同颜色
            colorIndex = hashString(identifier) % 1000;
        } else {
            // 顺序模式：按到达顺序分配（现有逻辑）
            // ... 保持原有代码
        }

        return getColorFromPalette(colorIndex, colorPalette);
    },
    [colorPalette, theme],
);
```

#### 步骤 5：在 UI 中添加配置入口

参考现有 `DateZoom` 组件的实现方式：

1. **位置**：Dashboard 页面工具栏（与 DateZoom 按钮放一起）
2. **UI 组件**：添加一个 Switch 或 ToggleButton
3. **文案**：
   - 中文："同步图表颜色"
   - English："Sync chart colors"
   - 提示：开启后看板内所有图表的相同维度值将显示相同颜色

**参考实现**：
- 状态管理：`DashboardProvider` 中添加 `syncChartColors` 状态
- UI 参考：`packages/frontend/src/features/dateZoom/components/DateZoom.tsx`

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `packages/common/src/types/dashboard.ts` | 添加 `syncChartColors?: boolean` 到 DashboardConfig |
| `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` | 透传 colorPalette，支持特性开关 |
| `packages/frontend/src/hooks/useChartColorConfig/useChartColorConfig.tsx` | 添加 hashString 函数，支持哈希模式 |
| `packages/frontend/src/components/Dashboard/DashboardForm.tsx` | 添加 UI 配置入口 |

## 验证方式

1. **同仪表板多图表**：在仪表板中放置多个使用相同维度的图表，验证颜色一致
2. **仪表板 vs 详情页**：在仪表板中打开图表详情，对比颜色是否一致
3. **页面切换**：切换不同仪表板/页面，验证颜色映射稳定
4. **不同数据顺序**：用不同顺序加载相同数据，验证颜色一致
5. **特性开关**：验证关闭特性时颜色行为与原来一致

## 常见问题

### Q1: 颜色从哪里配置？

**现有配置渠道**：
- **组织级别**：管理员在组织设置中配置 `chartColors`（默认调色板）
- **图表级别**：每个图表保存时可指定 `colorPalette`（当前仅 Dashboard 使用）
- **字段级别**：可在维度字段中配置 `colors` 属性（用于特定分类着色）

**本方案**：
- 默认行为不变（用户无感知）
- 开启看板特性后：颜色根据维度值自动计算，相同值获得相同颜色

### Q2: 颜色超出调色板范围怎么办？

**已有机制**（`getColorFromPalette` 函数）：
- 当索引 < 调色板长度时，直接使用调色板颜色
- 当索引 >= 调色板长度时，通过**色相旋转**（30°）+ 饱和度/亮度微调生成新颜色
- 这样即使有超过调色板数量的维度值，也能生成可区分的颜色

### Q3: 颜色重复（哈希碰撞）问题如何解决？

**碰撞概率分析**：
- 哈希取模范围：1000
- 哈希函数：简单的 DJB2 变体，分布相对均匀
- 碰撞概率：约 1/1000（0.1%），实际更低因为字符串内容不同

**缓解措施**：
- 取模范围 1000 提供足够的多样性
- 色相旋转机制会在超出调色板时产生渐变差异，即使索引相同也能区分

### Q4: 需要用户手动配置吗？

**可选配置**：
- 默认关闭，不影响现有行为
- 用户可在看板设置中开启"同步图表颜色"特性
- 开启后自动基于维度值生成颜色，无需手动映射

### Q5: `useHashBased` 是什么？

`useHashBased` 是**内部实现参数**，用于控制颜色分配策略：
- `false`（默认）：按图表内字段出现顺序分配颜色
- `true`：按维度值哈希分配颜色

**用户无需关心此参数**，它会根据看板的 `syncChartColors` 配置自动选择。

## 潜在影响

1. **现有看板颜色不变**：特性默认关闭，不影响现有用户
2. **开启后颜色可能变化**：用户主动开启后，颜色会变为哈希模式
3. **需要保存看板配置**：用户开启特性后需要保存看板
