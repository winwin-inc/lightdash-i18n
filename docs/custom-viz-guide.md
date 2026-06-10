# Lightdash 自定义图表：运行机制与原理

一句话总结：渲染时用「当前探索的查询结果」注入并出图；探索状态变化（改维度/筛选等）会触发新查询，新结果驱动新渲染。spec 不写数据，CustomVisualization 自动合并 `data: { name: "values" }` 并将 rows 转为 `series` 注入，Vega 按 name 绑定后渲染。

---

## Vega-Lite 基础概念

| 概念       | 说明                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| mark       | 图形类型（point、line、bar、geoshape、text 等）                                                                                      |
| encoding   | 数据字段 → 视觉通道（x、y、color、size、tooltip、latitude/longitude 等；用 field 指定列）                                            |
| data       | 数据来源（`values` 内联、`url` 外部、`name` 引用）。Lightdash 中 spec 可省略，组件自动合并 `data: { name: "values" }` 并注入探索结果 |
| transform  | 数据转换（filter、lookup、calculate、window 等）                                                                                     |
| layer      | 多层视图叠加                                                                                                                         |
| projection | 地图投影（如 mercator）                                                                                                              |

spec = 你编辑的整份 JSON（顶层 `$schema`、`layer`、`encoding` 等），不是某个键。encoding 的 `field` 指定用哪一列，须与探索结果的字段 id 一致。

### 流程图

```
[编辑 spec]  encoding.field 指定用哪列画 x/y/color 等
       │
       ▼
[探索查询]   rows（当前维度和指标的结果）
       │
       ▼
[convertRowsToSeries]  → series = { [fieldId]: raw }[]
       │
       │  CustomVisualization：合并 data: { name: "values" }，传入 data = { values: series }
       ▼
[Vega 渲染]  按 name 找 values → 按 field 取列 → 出图

绑定规则：spec 的 field 名 = 探索结果的字段 id
```

### 核心机制：命名数据集

`name: "values"` 包含什么：当前探索选中的维度和指标执行查询后的结果行，经 `convertRowsToSeries` 转为 `{ [fieldId]: raw }[]`（每行一条对象，key 为字段 id，value 为 raw 值），即 `series`。Lightdash 以 `data={{ values: series }}` 传入。

与 spec 的关联：CustomVisualization 渲染时把 `data: { name: "values" }` 合并到 spec 顶层，表示「本视图用名为 values 的数据集」；spec 中 `encoding.x.field`、`encoding.y.field`、`transform` 的 `field` 等从这份数据的列名（fieldId）取数；Vega 渲染时按 name 找到 `data.values`（即 series），再按 field 取列，完成「spec 配置 + 当前选中数据」的结合渲染。

职责分工：你编辑的只有 spec（JSON），不写查询结果的数据数组；Lightdash 把当前探索的查询结果转成 `series`，以 `data={{ values: series }}` 传给 Vega；Vega 把 spec 里所有引用 `name: "values"` 的地方绑定到传入的 `data.values`，实现「配置 + 数据」合一渲染。

### 数据形态与绑定规则

- 探索结果：`resultsData.rows`，每行 `Record<字段id, { value: { raw, formatted } }>`
- 转为 Vega 用：`convertRowsToSeries(rows)` → 每行 `{ [fieldId]: value.raw }`，组成数组 `series`
- 传给 VegaLite：spec 合并 `data: { name: "values" }`，另传 `data={{ values: series }}`

重要：encoding / transform 里的 `field` 必须与探索结果的字段 id 完全一致，否则无法正确绑定列。

### 用到的 Vega-Lite 功能

| 功能             | 说明                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 命名数据集       | `data: { name: "values" }` 引用数据集，由宿主在运行时提供实际数组，实现 spec 与数据分离。                                                                                      |
| 多数据源         | 同一 spec 可同时使用：① 命名数据集 `values`（探索结果）、② `data: { url: "..." }`（如 TopoJSON）、③ 内联 `data: { values: [...] }`。不同 layer 或 transform 可指向不同数据源。 |
| Lookup Transform | 在 transform 里用 `lookup` 把「主数据」（如地图几何）和「从表」按 key 关联；从表可写 `from: { data: { name: "values" } }`，从而把探索结果按 key 拼到几何或其它数据上。         |

### 小结

运行机制：Spec 只声明「用名为 `values` 的数据集」；Lightdash 在渲染时注入 `series` 到该名字下；Vega 按名绑定后渲染。原理要点：命名数据集、多数据源、lookup 等 Vega-Lite 能力，使「一份 spec + 任意符合字段 id 的查询结果」即可出图。

---

# 案例一：马上赢价格指数（折线图）

折线图案例：时间序列 × 价格指数，按集团分色；仅使用 `values` 数据集，无外部 TopoJSON，结构简单，便于理解「字段 → 视觉通道」的映射。

## 2.1 图表概览

- 类型：折线图（line + point），按集团分色
- 数据源：仅 `values`（探索结果由组件自动注入）
- 效果：时间 → 价格指数，多条折线按集团区分，tooltip 显示时间、集团、格式化后的指数

## 2.2 Spec 结构简析

| 配置项    | 说明                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| mark      | `type: "line"`，`point` 开启圆点（size 20、filled），`strokeWidth: 2`                       |
| x         | `field: "dwd_price_index_product_biz_date_month"`，temporal，格式 `%Y-%m`                   |
| y         | `field: "dwd_price_index_product_fisher_index"`，quantitative，scale `symlog`               |
| color     | `field: "dwd_price_index_product_group_name"`，nominal，图例横向 3 列                       |
| tooltip   | 时间、集团、`formatted_share`（由 transform 计算）                                          |
| transform | `calculate`：`formatted_share = format(datum.dwd_price_index_product_fisher_index, ',.2f')` |

## 2.3 字段与探索的对应关系

| 用途             | 建议维度/指标 | 对应 spec 字段 id                        |
| ---------------- | ------------- | ---------------------------------------- |
| 时间（x 轴）     | 月份维度      | `dwd_price_index_product_biz_date_month` |
| 集团（分色）     | 集团维度      | `dwd_price_index_product_group_name`     |
| 价格指数（y 轴） | 价格指数指标  | `dwd_price_index_product_fisher_index`   |

`formatted_share` 为 transform 中 `calculate` 生成的计算列，用于 tooltip 展示格式化后的指数。

## 2.4 完整 Spec（供直接粘贴）

```json
{
  "view": { "stroke": null },
  "layer": [
    {
      "mark": {
        "type": "line",
        "point": { "size": 20, "filled": true },
        "strokeWidth": 2
      },
      "encoding": {
        "x": {
          "type": "temporal",
          "field": "dwd_price_index_product_biz_date_month",
          "axis": { "format": "%Y-%m", "labelAngle": -90 },
          "title": ""
        },
        "y": {
          "type": "quantitative",
          "field": "dwd_price_index_product_fisher_index",
          "scale": { "type": "symlog" },
          "axis": { "format": ".1f" }
        },
        "color": {
          "type": "nominal",
          "field": "dwd_price_index_product_group_name",
          "legend": { "orient": "top", "columns": 3 }
        },
        "tooltip": [
          {
            "field": "dwd_price_index_product_biz_date_month",
            "title": "时间",
            "format": "%Y-%m"
          },
          { "field": "dwd_price_index_product_group_name", "title": "集团" },
          { "field": "formatted_share", "title": "马上赢价格指数" }
        ]
      },
      "transform": [
        {
          "as": "formatted_share",
          "calculate": "format(datum.dwd_price_index_product_fisher_index, ',.2f')"
        }
      ]
    }
  ],
  "width": "container",
  "height": { "step": 40 },
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "padding": 20
}
```

---

# 案例二：中国省份集团市占率（分层地图）

分层地图案例：TopoJSON + `values` + 内联数据多源混合，含 lookup、window 等 transform。

## 3.1 图表概览

- 类型：分层地图（多个 `layer`，含 geoshape、text 等）
- 底图：中国省级 TopoJSON（含南海九段线、南海诸岛标注）
- 业务数据：来自 Lightdash 探索的 `values`，字段包括省份名、集团名、市占率、经纬度等
- 效果：按「省份 ↔ 集团」着色，无数据/无集团省份为白底，在几何中心显示省份名与 tooltip

## 3.2 本案例中的数据源

| 数据源      | 来源               | 在 spec 中的用法                                                                  |
| ----------- | ------------------ | --------------------------------------------------------------------------------- |
| `values`    | Lightdash 查询结果 | 所有 `data: { name: "values" }` 的 layer/transform 使用；字段名 = 探索中的字段 id |
| TopoJSON    | 外部 URL           | 省级 polygon 几何，用于 geoshape 和 lookup 的 key                                 |
| 内联 values | spec 内写死        | 仅南海诸岛方块 + 文字，与业务 `values` 无关                                       |

## 3.3 图层流程（Layer 0 ～ 6）

| Layer | 数据     | 说明                                                         |
| ----- | -------- | ------------------------------------------------------------ |
| 0     | TopoJSON | 无市占率省份 → 白底 geoshape（lookup 后 market_share==null） |
| 1     | TopoJSON | 有市占率省份 → 按集团着色（lookup + window 算出现次数）      |
| 2     | TopoJSON | 九段线（filter 境界线）                                      |
| 3、4  | 内联     | 南海诸岛方块 + 文字                                          |
| 5     | values   | 有集团省份名 + tooltip（直接用探索结果）                     |
| 6     | values   | 无集团省份名（filter 与 5 互为补集）                         |

## 3.4 字段与探索的对应关系

| 用途                         | 建议维度/指标 | 对应 spec 字段 id（示例）                                         |
| ---------------------------- | ------------- | ----------------------------------------------------------------- |
| 省份名（地图 lookup + 标注） | 省份维度      | `ads_province_heatmap_sales_group_top_m_province_name`            |
| 集团（着色、图例）           | 集团维度      | `ads_province_heatmap_sales_group_top_m_group_name`               |
| 市占率                       | 市占率指标    | `ads_province_heatmap_sales_group_top_m_total_market_share`       |
| 标注位置                     | 纬度/经度     | `ads_province_heatmap_sales_group_top_m_lat` / `_lon`（同一前缀） |

探索结果中的字段 id 需与 spec 中 `field` 一致；若不同，需在 spec 中全局替换为实际 id。

---

# 复合图（hconcat / vconcat / facet / repeat）

## 四种复合模式

| 模式 | 排列方式 | 子图数量由谁决定 | 典型场景 |
|------|----------|------------------|----------|
| `hconcat` | 横向并排 | spec 中子项个数 | 双指标对比（当前 vs 上期市占率） |
| `vconcat` | 纵向堆叠 | spec 中子项个数 | 上图表 + 下明细 |
| `facet` | 按字段分面网格 | 数据中分面字段唯一值个数 | 按省份/品牌各画一张图 |
| `repeat` | 按字段列表重复 | `repeat.row` / `repeat.column` 列表长度 | 多指标同模板批量出图 |

与 `layer`（图层叠加）的区别：`layer` 将多个 mark 叠在同一张图上，且支持 `width/height: 'container'` 响应式；上述四种复合模式在 Vega-Lite 中**不支持** container/fit 响应式。

## Lightdash 尺寸处理逻辑

渲染前由 `normalizeVegaSpecSizing`（[`packages/frontend/src/components/CustomVisualization/normalizeVegaSpecSizing.ts`](../packages/frontend/src/components/CustomVisualization/normalizeVegaSpecSizing.ts)）按 spec **结构键**分类处理，不依赖字段名或 mark 类型：

```
用户 spec → prepareSpecForVega（可选 label 改写）
         → normalizeVegaSpecSizing（按容器尺寸分配子视图宽高）
         → VegaLite 渲染（注入 data: { name: "values" }）
```

| 分类 | 判断条件 | 处理方式 |
|------|----------|----------|
| 单视图 | 有 `mark` + `encoding`，无复合键 | `width/height: 'container'`，`autosize: fit` |
| layer | 有 `layer: [...]`，无复合键 | 同上 |
| 复合视图 | 根级有 `hconcat` / `vconcat` / `concat` / `facet` / `repeat` | 递归为子视图注入像素 `width`/`height`，`autosize: pad` |

### 复合子类型空间分配

| 键名 | 子图数量来源 | 空间分配 |
|------|-------------|----------|
| `hconcat` | `hconcat.length` | 容器宽度均分（扣除 `spacing`，默认 20，与 Vega-Lite 一致） |
| `vconcat` | `vconcat.length` | 容器高度均分 |
| `concat` | `concat.length`；有 `columns` 时按列数分行列网格 | 宽高各均分 |
| `repeat` | `repeat.row` / `repeat.column` 数组长度 | 内层 `spec` 按行列均分 |
| `facet` | `series` 中分面字段唯一值个数（无数据时 fallback=1） | 内层 `spec` 按行列均分 |

用户已在子视图手写固定数字 `width`/`height` 时，Lightdash **保留用户值不覆盖**。`padding` 为 Vega-Lite 原生配置，Lightdash 原样透传；复合图在均分子视图尺寸前会**预留** `padding` 与轴标签区域（x/y 轴、倾斜类目标签等），避免绘图区占满容器后被 tile 的 `overflow: hidden` 裁切底部。

### 为何复合图曾被裁切

1. Lightdash 曾对所有 spec 强制 `width/height: 'container'` 和 `autosize: fit`
2. Vega-Lite 官方限制：container/fit **仅适用于单视图和 layer**（[Size 文档](https://vega.github.io/vega-lite/docs/size.html)）
3. 复合图回退到子视图默认宽度（约 200px），超出 tile 容器后被 `overflow: hidden` 裁切

## 数据流

- **通用**：`convertRowsToSeries` → `data={{ values: series }}`，spec 合并 `data: { name: "values" }`
- **facet**：需用 `series` 统计分面字段唯一值，才能合理分配每个 facet cell 的宽度
- **rewrite: true**：改写前若 spec 无 `data`，Lightdash 临时补上 `data: { name: "values" }`；`hconcat`/`vconcat`/`concat` 子视图继承 values 上下文。详见 [`rewriteVegaSpecFieldLabels.flowchart.md`](./rewriteVegaSpecFieldLabels.flowchart.md)

## 案例：hconcat 双柱市占率对比

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "padding": 20,
  "hconcat": [
    {
      "mark": "bar",
      "encoding": {
        "x": {
          "field": "ads_pinleibao_category_sales_cls_4",
          "type": "nominal",
          "title": "类目",
          "axis": { "labelAngle": -30 }
        },
        "y": {
          "field": "ads_pinleibao_category_sales_total_current_market_share",
          "type": "quantitative",
          "title": "当前市占率"
        },
        "color": { "value": "#7BA9D0" }
      }
    },
    {
      "mark": "bar",
      "encoding": {
        "x": {
          "field": "ads_pinleibao_category_sales_cls_4",
          "type": "nominal",
          "title": "类目",
          "axis": { "labelAngle": -30 }
        },
        "y": {
          "field": "ads_pinleibao_category_sales_total_last_market_share",
          "type": "quantitative",
          "title": "上期市占率"
        },
        "color": { "value": "#E6523F" }
      }
    }
  ],
  "data": { "name": "values" }
}
```

`padding` 为 Vega-Lite 顶层边距（[官方文档](https://vega.github.io/vega-lite/docs/spec.html#top-level-properties)）：数字表示四边相同，也可写 `{ "top": 16, "right": 24, "bottom": 16, "left": 24 }`。语法正确即会生效；若仅 `bottom` 看不出留白，多为子图占满容器后底部 padding 被裁切，Lightdash 已在尺寸分配时预留该边距。

### 各类型最小 spec 片段

**vconcat**（上下两张图）：

```json
{
  "vconcat": [
    { "mark": "line", "encoding": { "x": { "field": "date", "type": "temporal" }, "y": { "field": "sales", "type": "quantitative" } } },
    { "mark": "bar", "encoding": { "x": { "field": "category", "type": "nominal" }, "y": { "field": "sales", "type": "quantitative" } } }
  ]
}
```

**facet**（按字段自动分面）：

```json
{
  "facet": { "field": "region", "type": "nominal" },
  "spec": {
    "mark": "bar",
    "encoding": {
      "x": { "field": "category", "type": "nominal" },
      "y": { "field": "sales", "type": "quantitative" }
    }
  }
}
```

**repeat**（多指标重复）：

```json
{
  "repeat": { "column": ["sales", "profit"] },
  "spec": {
    "mark": "bar",
    "encoding": {
      "y": { "field": { "repeat": "column" }, "type": "quantitative" },
      "x": { "field": "category", "type": "nominal" }
    }
  }
}
```

## 响应式（PC / Mobile 双 spec）

窄屏适配为 **opt-in**：根 spec 作 desktop，可选 `lightdash.responsive.mobile` 在**页面宽度**低于 breakpoint 时切换为 mobile spec。Explorer 编辑器支持 PC/Mobile 分 tab 编辑与预览切换。无配置时行为不变。

详细配置说明、编辑器用法、完整示例与维护指南见 **[custom-viz-responsive.md](./custom-viz-responsive.md)**。

## 已知限制与类似布局问题

复合图在 tile 内使用固定像素子视图 + `overflow: hidden`，下列情况可能出现裁切（Lightdash 已通过轴预留、`spacing` 对齐等方式缓解）：

| 方向 | 常见原因 |
|------|----------|
| 底部 | x 轴标签、`labelAngle` 倾斜标签、用户 `padding.bottom` |
| 右侧 | 子图间距 `spacing` 与 Vega 默认不一致、倾斜标签向右延伸、最右侧子图外缘 |
| 左侧 | y 轴标题/刻度较长 |
| 顶部 | 图表 `title`、facet 标题行 |

其他限制：

- Dashboard 导出图片（`DashboardExportImage`）当前只取第一个 canvas，复合图导出可能不完整
- facet 分面数极多时单格过窄，可能需减少分面或加宽 tile
- 用户手写固定子视图尺寸时不被 Lightdash 覆盖；若与容器不匹配可能留白或裁切
- spec 中显式 `"spacing": N` 时，Lightdash 按该值均分；未写时注入 `20` 与 Vega 默认一致
