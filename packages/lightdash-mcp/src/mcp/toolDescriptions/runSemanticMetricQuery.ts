/** MCP tool description for run_semantic_metric_query (AI-first, Explorer JSON passthrough). */
export const RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION = `【语义 Metric Query】执行 Explorer 复制的整段 Metric Query（v2 异步 + 轮询，首条 CSV）。

## 强制规则（违反会报错或查不出数）
1. 必须用本工具 run_semantic_metric_query，不要用 run_metric_query 承载整段 Explorer JSON。
2. 整段 query 只放在参数 metricQuery（对象）内；禁止把 exploreName、dimensions、metrics、filters 平铺在工具顶层。
3. dimensions、metrics 必须是字符串数组，例如 ["brand_cls4_insight_list_brand_name"]，禁止写成单个字符串。
4. 从 Explorer 复制后：改筛选只改 filters.dimensions.and[i].values；保留 target.fieldId、operator、id；类目文案须与 Explorer 下拉完全一致。
5. 空 tableCalculations / additionalMetrics / customDimensions / metricOverrides 可省略（传空 []/{} 也会自动去掉）。
6. 需要项目时先 set_project 或传 projectUuid。

## 何时使用
- Explorer「复制 Metric Query」后原样或小幅修改（改类目、品牌、周期等）
- filters.dimensions.and 多条件、复杂 sorts、tableCalculations

## 何时不要用
- 仅 1~2 维度 + 1 指标 + 极简 filters → run_metric_query（扁平顶层参数）

## 参数
- metricQuery（必填，object）：整段 Metric Query
- projectUuid（可选）、limit（可选，覆盖 metricQuery.limit）、context、invalidateCache、full

## 工具调用形状（正确）
run_semantic_metric_query({
  projectUuid: "<可选>",
  metricQuery: { exploreName, dimensions, metrics, filters, sorts, limit, ... }
})

错误示例：run_semantic_metric_query({ exploreName, dimensions, metrics, filters })  // 缺 metricQuery 包裹
错误示例：run_metric_query({ metricQuery: { ... } })  // 应换本工具

## 案例：brand_cls4_insight_list 改类目
从「运动饮料」改为「非冷藏即饮果汁」：只改 cls_4 那条 filter 的 values，其余不动。

metricQuery: {
  exploreName: "brand_cls4_insight_list",
  dimensions: ["brand_cls4_insight_list_brand_name"],
  metrics: ["brand_cls4_insight_list_total_brand_growth_cls_4"],
  filters: {
    dimensions: {
      and: [
        { target: { fieldId: "brand_cls4_insight_list_brand_name" }, operator: "notEquals", values: ["其他品牌"] },
        { target: { fieldId: "brand_cls4_insight_list_cls_4" }, operator: "equals", values: ["非冷藏即饮果汁"] },
        { target: { fieldId: "brand_cls4_insight_list_period" }, operator: "equals", values: ["2026Q1"] }
      ]
    }
  },
  sorts: [{ fieldId: "brand_cls4_insight_list_total_brand_growth_cls_4", descending: true }],
  limit: 500
}

## 错误处理
- 422/4xx：Lightdash API 校验失败，按返回信息改 metricQuery 后重试
- 401/403：检查 PAT 与项目权限
- xxx.filter is not a function：通常是把 Explorer JSON 传给了 run_metric_query，或 dimensions/metrics 不是数组`;
