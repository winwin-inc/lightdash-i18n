---
name: lightdash-chart-semantics
description: 当用户提到柱/线/表/KPI/大数字/饼图/漏斗/地图/PoP、坐标轴与透视、看板 tile、chartSlug，或询问保存图与自定义查询如何对应可视化时加载（英文触发词：bar, line, table, KPI, big number, pie, funnel, map, PoP, pivot）。补充路由技能的图表语义与 MCP 返回解读；非 Lightdash 应用开发文档。
---

# Lightdash 图表语义

**分工：** 分支与门禁在 **[`lightdash-insight-router`](../lightdash-insight-router/SKILL.md)**（**[`ROUTER-SOP.md`](../lightdash-insight-router/ROUTER-SOP.md)**）；**[`lightdash-metric-query`](../lightdash-metric-query/SKILL.md)** 管扁平 `run_metric_query`。本技能管**可视化语义**与 MCP 结果解读。

**来源：** Lightdash 开源参考（MIT）；与部署不一致时以 **API/MCP 实际返回**为准。

## 何时加载

- 图表类型/版式、看板 tile、`chartSlug`、tile 标题与重命名不同步。
- 环比/同比（PoP）或对比口径；`get_saved_chart` 后需解读 **`chartConfig.type`** + **`metricQuery`**。

不重写完整工具链；下表用于**参数**与**解读**。

## 意图与 MCP 路径

| 用户意图 | 优先策略 | MCP 顺序 |
|----------|----------|----------|
| 已有保存图/看板 | 复用服务端 viz | `find_charts` / `find_dashboards` 或 `find_content` → `get_saved_chart` → `run_saved_chart` |
| 自定义且心中有图形态 | 临时查询 | `list_explores` →（`find_fields`）→ `run_metric_query`（维度/指标取下表**最小集**） |
| 浏览器打开 | 人工 | 工具返回的 **`webUrl`**，禁手拼 |

**效率：** 同一意图勿重复 `list_explores`（explore 无误时）；遵守 router 调用上限。

## 图表类型与最小 `metricQuery`

未用 `run_saved_chart` 时，`metricQuery.dimensions` 中每维须对 viz 有意义（多余维改分组、易扭指标）。

| 用户说法 / 族 | `chartConfig.type` | 最小提示 |
|---------------|-------------------|----------|
| 趋势、柱/线、面积、散点 | `cartesian` | 通常 1 类目/时间维 + 多 metrics；勿加未进 layout/pivot 的维 |
| 数字表、多字段 | `table` | 列上要的 dimensions + metrics；控 `limit` |
| 单一大数字 | `big_number` | 常仅 metrics 或 1 维细分；`limit` 宜小 |
| 部分与整体 | `pie` | 常见 1 维 + 1 metric |
| PoP | 图 + 附加 metrics | 优先保存图；否则见 [chart-families-mcp.md#pop](./resources/chart-families-mcp.md#pop) |

各族细节（笛卡尔/表/KPI/饼/PoP/看板 tile）：**[chart-families-mcp.md](./resources/chart-families-mcp.md)**（可用锚点 `#cartesian`、`#table`、`#big-number`、`#pie`、`#pop`、`#dashboard-tiles`）。

## 看板 tile（摘要）

`chartSlug`；tile **`title`** 为覆盖名，重命名图表**不**自动更新 tile。数据路径：发现 → `get_saved_chart` → `run_saved_chart`（**UUID**，非 slug）。详 **[#dashboard-tiles](./resources/chart-families-mcp.md#dashboard-tiles)**。

## MCP 返回与展示

**[mcp-response-mapping.md](./resources/mcp-response-mapping.md)**：`run_metric_query` / `run_saved_chart` 的 `rows`、`columns`、`fields`、`structuredContent`、CSV、`webUrl` 等。

## 维护

- 与 Lightdash 开源行为不一致时，以 **MCP `tools/list` 与响应 JSON** 及你方部署的 **API/图表配置**为准；本文随部署变化更新。
