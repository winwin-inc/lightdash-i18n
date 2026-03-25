# 看板颜色同步优化方案

> 更新时间：2026-03-25

## 问题描述

切换筛选器后，不同维度值的颜色太接近/相似。

## 问题根源

1. **哈希碰撞**：简单哈希算法导致相邻字符串（如 "品牌A"、"品牌B"）命中相似颜色
2. **变体不足**：9色→45色的扩展不够，相邻颜色差异小

## 解决方案：全局颜色分配器 + 色差保障

### 设计思路

1. **Dashboard 级别全局分配器**
   - 相同 identifier → 相同颜色（跨图表一致）
   - 按 dashboardUuid 隔离，不同 Dashboard 独立

2. **色差保障机制**
   - 分配新颜色时检测是否与已使用颜色太相似
   - 如果相似则顺延到下一个可用颜色
   - 确保不同维度值有明显颜色差异

3. **支持图表选择**
   - `syncChartColors` 特性开关控制是否启用
   - `syncChartTileUuids` 配置需要同步的图表列表

### 实现逻辑

```typescript
// 全局颜色分配器，按 Dashboard 隔离
const globalColorAssignments = new Map<string, Map<string, string>>();
// key: dashboardUuid, value: Map<identifier, color>

const getGlobalHashColor = (identifier, colorPalette, dashboardUuid) => {
    // 1. 如果之前已分配过，返回相同颜色（跨图表一致）
    if (dashboardAssignments.has(identifier)) {
        return dashboardAssignments.get(identifier);
    }

    // 2. 计算初始颜色
    const hash = hashString(identifier);
    let colorIndex = hash % expanded.length;
    let color = expanded[colorIndex];

    // 3. 检查是否与已分配颜色太相似，如果是则顺延
    while (usedColors.some(c => colorDiff(color, c) < MIN_DIFF)) {
        colorIndex = (colorIndex + 1) % expanded.length;
        color = expanded[colorIndex];
    }

    // 4. 记录并返回
    dashboardAssignments.set(identifier, color);
    return color;
};
```

### 关键特性

| 特性 | 说明 |
|------|------|
| 跨图表一致 | 相同维度值在不同图表中获得相同颜色 |
| 色差保障 | 不同维度值颜色有明显差异（避免相似） |
| 图表选择 | 支持选择特定图表应用颜色同步 |
| 调色板保留 | 使用用户自定义调色板 |
| Dashboard 隔离 | 不同 Dashboard 有独立颜色状态 |

---

## 实现内容

### 步骤 1：改进哈希算法 ✅

- 使用 FNV-1a 哈希算法（分布更均匀）
- 扩展调色板：9色→72色（8个变体）

### 步骤 2：添加色差计算函数 ✅

- `colorDifference()` 计算两个颜色的欧氏距离
- 阈值 MIN_COLOR_DIFF = 30

### 步骤 3：全局颜色分配器 ✅

- `globalColorAssignments` 按 dashboardUuid 隔离
- `getGlobalHashColor()` 带色差检测和顺延逻辑

### 步骤 4：传递 dashboardUuid ✅

- `DashboardChartTile` 获取 `dashboardUuid`
- 传递给 `VisualizationProvider`
- 传递给 `useChartColorConfig`

---

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `useChartColorConfig.tsx` | 添加色差计算、全局分配器 |
| `VisualizationProvider.tsx` | 接收 dashboardUuid，使用全局分配器 |
| `DashboardChartTile.tsx` | 获取并传递 dashboardUuid |

---

## 验证方式

1. **跨图表一致**：不同图表相同维度值显示相同颜色
2. **色差明显**：不同维度值颜色有明显视觉差异（如农夫山泉 vs 东鹏 vs 元气森林 vs 统一）
3. **图表选择**：只对选中图表应用同步
4. **筛选器切换**：相同维度值颜色保持不变
