# 图表族与看板

能走**保存图**则 `find_*` → `get_saved_chart` → `run_saved_chart`；自定义再用 `run_semantic_metric_query`（或极简扁平 `run_metric_query`），维度/指标取**最小集**。展示字段见 [mcp-response-mapping.md](./mcp-response-mapping.md)。

## cartesian

`chartConfig.type: cartesian`（完整 YAML 以 Lightdash 官方或你方 fork 的图表文档为准）。

- **说法：** 趋势、折线、柱状、对比、双轴、堆叠柱、scatter 等。
- **自定义：** `exploreName` + **一个主分桶维度**（时间或类目）+ **metrics**；仅当映射到 `layout` / `pivotConfig` / series `encode` 时才加额外维度。
- **习惯：** 先 1 维 + 1 metric、`limit` 50–200；再按需加第二维；合计不对先删未上轴的维度。
- **空图/平线：** 用 `find_fields` 核对筛选、时间范围、字段 id。

## table

`chartConfig.type: table`。

- **说法：** 表格、明细、pivot、冻结列、合计行等。
- **自定义：** 每**可见列**对应请求的 dimension 或 metric；仍避免无意改变分组的冗余维度。
- **展示：** `rows` + `fields`（见 [mcp-response-mapping.md](./mcp-response-mapping.md)）。

## big-number

`chartConfig.type: big_number`。

- **说法：** 大盘数字、KPI、总额；同比/环比若保存图已有 **additional metrics** 则优先保存图。
- **自定义：** 通常单 metric，`dimensions: []`；按段展示标题时可用一维或改表格。
- **`selectedField`** 须在 `metricQuery.metrics` 内；用 `find_fields` / `list_explores` 映射到**精确 metric id**，勿猜。

## pie

`chartConfig.type: pie`（完整配置以官方或 fork 文档为准）。

- **说法：** 占比、构成、饼图。
- **最小：** 通常 **1 维度 + 1 metric**；多加维易混乱，用小 `limit` 校验。

## pop

PoP 常依赖 **additional metrics** / 图表配置；具体 YAML 因 Lightdash 版本与项目而异。

1. 保存图已实现 PoP → **只** `run_saved_chart`，勿手搓。
2. 临时探索 → 确认字段 id 后再加 additional metrics / table calculations；不确定则反问或建议 UI 改保存图后再跑。

勿一次堆叠 PoP 与过宽维度；首轮验证后再加复杂度。

## dashboard-tiles

- **`saved_chart` tile：** `properties.chartSlug`；`title` / `chartName` **覆盖**显示名，图表重命名**不**自动同步 tile。
- **SQL tile：** `savedSqlUuid` 等；无 SQL tool 时由 **`lightdash-insight-router`** 回退到维度/指标。
- **路径：** `find_dashboards` → `webUrl` 浏览；拉数则每 tile → `find_charts` / `get_saved_chart` → `run_saved_chart`（**`chartUuid`** 须搜索得来，勿猜）。
- **效率：** N 大时不要未确认就并行 N 次 `run_saved_chart`。
