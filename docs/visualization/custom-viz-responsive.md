# Custom Viz 响应式配置（PC / Mobile 双 spec）

一句话总结：根 spec 作为 **desktop**；可选 `lightdash.responsive.mobile` 在**页面宽度**低于 `breakpoint`（默认 768）时**整份替换**为 mobile spec。无配置时行为与改前完全一致。

---

## 适用场景

| 场景 | 建议 |
|------|------|
| 多品牌竖 bar、PC 宽屏 + 移动端可读性差 | 配置 `mobile` 横 bar |
| 折线、饼图、类目少的图 | 不写 responsive，保持默认 fit |
| `hconcat` / `facet` 等复合图 | 暂不支持 responsive（自动忽略 mobile） |

---

## Explorer 编辑器（推荐）

Custom Viz 配置面板支持 **PC / Mobile 分 tab 编辑**，无需手写嵌套 `lightdash`：

1. 在 **桌面端** tab 编辑 desktop JSON
2. 切换到 **移动端** tab 编辑 mobile JSON（有有效 JSON 即启用移动端配置）；图表预览随 tab 切换（桌面端 / 移动端）
3. 点顶部 **保存** 才持久化

保存时自动 **compose** 为下方存储格式；加载 chart 时自动 **decompose** 拆回两个 tab。Mobile tab 为空或无效 JSON 时不会写入 `lightdash.responsive`。

Dashboard 运行时仍按页面宽度与断点（768px）自动选择 spec。

---

## 配置结构（存储格式）

```json
{
  "rewrite": true,
  "lightdash": {
    "responsive": {
      "breakpoint": 768,
      "mobile": {
        "layer": [],
        "encoding": {}
      }
    }
  },
  "layer": [],
  "encoding": {}
}
```

| 字段 | 说明 |
|------|------|
| 根 spec | **desktop**，页面宽度 ≥ breakpoint 时使用 |
| `lightdash.responsive.breakpoint` | 断点像素，默认 `768`；与 **`window.innerWidth`（页面/视口宽度）** 比较 |
| `lightdash.responsive.mobile` | 完整 Vega-Lite spec，页面宽度 < breakpoint 时整份替换 desktop |
| `rewrite` | 只在根 spec 写一次；mobile spec 会继承改写 |

传给 Vega 前，`lightdash` 键会被移除，不影响 Vega-Lite 渲染。

---

## 运行时规则

```
无 lightdash.responsive          → 现状（fit 容器）
viewport >= breakpoint           → 根 spec（desktop）
viewport < breakpoint 且无 mobile → 根 spec（fit 压缩，与现状相同）
viewport < breakpoint 且有 mobile → mobile spec 整份替换
根 spec 为复合图                 → 忽略 mobile（开发环境 console 警告）
```

**保存时机**：编辑 JSON 后 debounce 更新 Explorer 内存中的未保存 chart；点击 **保存图标** 才写入数据库。

**预览**：Explorer 中切换桌面端 / 移动端 tab 即切换图表预览，不触发保存。Dashboard 始终按页面宽度 + breakpoint 自动选 spec。

---

## 完整示例：品牌市场份额增长

### desktop（根 spec，竖 bar）

与现有写法相同：竖 bar、0 基准线、数值标签、底部品牌 text 层。

### mobile（`lightdash.responsive.mobile`，横 bar）

建议：

- `orient: "horizontal"`
- Y 轴显示品牌名（可去掉 desktop 的底部 text 层）
- `height: { "step": 32 }` 按品牌数撑高；超出 tile 高度时出现纵向滚动

```json
{
  "rewrite": true,
  "lightdash": {
    "responsive": {
      "breakpoint": 768,
      "mobile": {
        "height": { "step": 32 },
        "layer": [
          {
            "mark": { "type": "rule", "stroke": "#CCCCCC", "strokeWidth": 1.1 },
            "encoding": { "x": { "datum": 0 } }
          },
          {
            "mark": {
              "type": "bar",
              "orient": "horizontal",
              "color": {
                "expr": "datum.growth > 0 ? '#00B050' : '#FF0000'"
              }
            }
          },
          {
            "mark": {
              "type": "text",
              "fontSize": 11,
              "fontWeight": "bold",
              "baseline": "middle",
              "dx": { "expr": "datum.growth > 0 ? 4 : -4" },
              "align": { "expr": "datum.growth > 0 ? 'left' : 'right'" },
              "color": { "expr": "datum.growth > 0 ? '#00B050' : '#FF0000'" }
            },
            "encoding": {
              "text": { "field": "growth", "type": "quantitative", "format": ".2%" }
            }
          }
        ],
        "encoding": {
          "y": {
            "field": "brand",
            "type": "nominal",
            "title": "",
            "sort": { "field": "growth", "order": "descending" }
          },
          "x": {
            "field": "growth",
            "type": "quantitative",
            "title": "本期市场份额增长(占四级类目)",
            "axis": { "format": ".0%" }
          }
        }
      }
    }
  },
  "layer": [
    { "mark": { "type": "bar", "orient": "vertical" } }
  ],
  "encoding": {
    "x": { "field": "brand", "type": "nominal" },
    "y": { "field": "growth", "type": "quantitative" }
  }
}
```

将 `brand`、`growth` 替换为实际 fieldId；若使用 `rewrite: true`，也可写中文 label（与 desktop 一致）。

---

## 维护指南

1. **改 PC 布局** → Explorer 中编辑 PC tab，或只动根 spec
2. **改移动端** → Explorer 中编辑 Mobile tab，或只动 `lightdash.responsive.mobile`
3. **`rewrite: true`** → 只在根 spec 写一次；窄屏时自动作用于 mobile spec
4. **红绿配色 expr** → desktop / mobile 两处保持一致（建议复制同一段）
5. **`breakpoint`** → 按目标设备页面宽度调整，默认 768

验证步骤：

1. Explorer 宽屏切桌面端 tab 确认 desktop
2. 切移动端 tab（或 DevTools 375px 页面宽度）确认 mobile
3. 过滤改变品牌数量后，确认 mobile 高度与滚动正常
4. 点保存后重新打开 chart，确认 PC / Mobile tab 内容正确

---

## mobile 布局建议

| 项 | 建议 |
|----|------|
| 方向 | 横 bar（`orient: "horizontal"`） |
| 高度 | `height: { "step": 28~36 }` |
| 品牌名 | 用 Y 轴标签，不必重复 desktop 底部 text 层 |
| 滚动 | 品牌多时自动 `overflow-y: auto`（前端处理） |

---

## 调试清单

| 现象 | 可能原因 |
|------|----------|
| 窄屏仍显示 desktop 竖 bar | 页面宽度 ≥ breakpoint；或未配置 `mobile` |
| 宽屏编辑看不到 mobile | 切换到移动端 tab 预览 |
| 窄屏仍被压缩 | mobile spec 未生效；检查 JSON 结构与 field 名 |
| 字段绑不上 | `rewrite` 未开或 fieldId 与查询结果不一致 |
| mobile 高度不对 | 检查 `height.step` 与 Y 轴 `field` |
| 复合图未切换 | 预期行为：composite spec 忽略 responsive |

---

## 已知限制（后续迭代）

- 不支持 `scrollX` 横向滚动
- 不支持 `rules` 多档断点（如手机 / 平板 / PC 三套）
- 不支持 `hconcat` / `facet` / `repeat` 等复合图的 responsive
- 导出图片可能只包含可视区域（非完整 scroll 高度）

---

## 相关代码

| 路径 | 说明 |
|------|------|
| `packages/frontend/src/components/CustomVisualization/responsive/` | 解析、compose/decompose、选 spec、layout 计算 |
| `packages/frontend/src/components/VisualizationConfigs/ChartConfigPanel/CustomVis/CustomVisConfig.tsx` | PC/Mobile 双 tab 编辑器 |
| `packages/frontend/src/components/CustomVisualization/index.tsx` | 渲染编排 |
| `packages/frontend/src/components/CustomVisualization/normalizeVegaSpecSizing.ts` | mobile `height.step` sizing |
| `packages/frontend/src/components/CustomVisualization/rewriteVegaSpecFieldLabels.ts` | `rewrite` 与 strip `lightdash` |

更多 Custom Viz 基础机制见 [custom-viz-guide.md](./custom-viz-guide.md)。
