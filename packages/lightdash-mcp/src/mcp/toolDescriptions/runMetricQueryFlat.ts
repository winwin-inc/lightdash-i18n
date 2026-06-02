/** MCP tool description for run_metric_query (flat parameters only). */
export const RUN_METRIC_QUERY_FLAT_DESCRIPTION = `【扁平 Metric Query】简单指标查询（v2 异步 + 轮询，首条 CSV）。

## 强制规则
1. 仅使用顶层扁平参数：exploreName（必填）、dimensions[]、metrics[]、filters、sorts、limit 等。
2. 禁止传 metricQuery、queryConfig、config；整段 Explorer JSON 必须用 run_semantic_metric_query。
3. dimensions、metrics 必须是字符串数组。
4. 不支持在 filters 里原样保留 Explorer 的 filters.dimensions.id / and[].id；多条件 and 链请用 run_semantic_metric_query。

## 何时使用
- 1~2 个 dimensions + 1 个 metrics + 简单 filters
- 无需复制 Explorer 整段 JSON

## 何时不要用
- Explorer「复制 Metric Query」、filters.dimensions.and 多条件（含改类目/品牌/周期）→ run_semantic_metric_query + metricQuery

## 参数（仅顶层）
exploreName、dimensions[]、metrics[]、filters（对象）、sorts、limit；
可选 projectUuid、requiredFilterFieldIds[]、timezone、context、invalidateCache、full

## 最小示例
{ exploreName: "orders", dimensions: ["orders_order_date_month"], metrics: ["orders_total_order_amount"], filters: {}, sorts: [], limit: 50 }

## 与语义工具对照
| 场景 | 工具 |
| Explorer 复制整段 JSON / 改类目 values | run_semantic_metric_query + metricQuery |
| 手写 2~3 个扁平字段 | run_metric_query |`;
