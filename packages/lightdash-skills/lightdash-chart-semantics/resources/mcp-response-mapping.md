# MCP 返回 → 展示（Lightdash HTTP MCP）

**仅使用**最近一次工具响应里**确实出现**的字段；若某字段缺失，**不要**臆造。

## `run_metric_query`

字段布局以你方 MCP 对该工具的实际返回为准（见线上 `tools/list` 与响应 JSON）：

| 消费方 | 数据来源 |
|--------|----------|
| **表格预览 / CSV** | 首个 `content[]` 项：**text** 正文 = 行的 **CSV**（无表格列时可能为占位）。 |
| **结构化网格** | 第二个 `content[]` 项：JSON 字符串；MCP 同时设置 **`structuredContent`** 为同一对象。 |
| **列 / 表头** | `structuredContent.columns`、`structuredContent.fields`，与 `rows` 对齐。 |
| **行数据** | `structuredContent.rows`（行对象数组）。 |
| **警告** | `structuredContent.warnings`（例如维度/指标与图表规则不一致时「结果可能不正确」类提示）。 |
| **查询 id** | `structuredContent.queryUuid`（排障/工单用）。 |

**展示规则：** 在助手 UI 中做表/图时，优先从 **`structuredContent`**（或 CSV）渲染；**数字**须引用 rows/columns 中的值，勿从自由文本猜测。

## `run_saved_chart`

返回**单个** JSON 文本负载（无独立 CSV 块）。具体形状以你方 MCP/API 对该工具的实现为准：

| 字段 | 用途 |
|------|------|
| `queryUuid` | 异步查询标识。 |
| `rows` | 表格行或构造序列的数据。 |
| `columns` | 来自 API 的列元数据 / 透视布局。 |
| `fields` | 字段 id、类型、item URL 等——驱动列顺序与格式。 |
| `warnings` | 与 metric query 的 warnings 语义一致。 |
| `parameterReferences` | 存在哪些看板/图表参数。 |
| `usedParametersValues` | 本次运行生效的参数值。 |

**展示规则：** 用 **`rows` + `fields`（+ `columns`）** 构造表或图；在声称准确前先看 **warnings**。

## `get_saved_chart`

JSON 含 **`webUrl`**（及 `siteBaseUrl`）等，用于在浏览器打开图表。「在 Lightdash 里打开」类流程应使用这些字段。

## `find_charts` / `find_dashboards` / `find_content`

列表在可用时包含 **`webUrl`**——**优先使用**这些 URL，不要手拼 slug。

## `get_site_info`

提供 **`siteBaseUrl`**；仅当 API 已返回相对路径时才与相对路径组合（仍优先使用各对象上的 `webUrl`）。
