/** MCP tool description for run_semantic_metric_query (AI-first, Explorer JSON passthrough). */
export const RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION = `【语义 Metric Query】执行 Explorer 复制的整段 Metric Query（v2 异步 + 轮询，首条 CSV）。

## 强制规则（违反会报错或查不出数）
1. 必须用本工具 run_semantic_metric_query，不要用 run_metric_query 承载整段 Explorer JSON。
2. metricQuery 为 **JSON 字符串**（用法同 run_sql 的 sql）：Explorer「复制 Metric Query」后整段粘贴，禁止拆成键值对或平铺到工具顶层。
3. dimensions、metrics 在 JSON 内必须是字符串数组，禁止写成单个字符串。
4. 改筛选只改 filters.dimensions.and[i].values；保留 target.fieldId、operator、id；类目文案须与 Explorer 下拉完全一致。
5. 空 tableCalculations / additionalMetrics / customDimensions / metricOverrides 可省略（传空 []/{} 也会自动去掉）。
6. 需要项目时先 set_project 或传 projectUuid。

## 看板上下文 dashboardUuid
部分 explore 依赖 dashboardSlug。
- 已知看板时传 dashboardUuid；可放在 metricQuery JSON 内，也可用顶层参数（顶层优先）。
- 未传且需要看板上下文时，不是报错；会返回 \`status: "dashboard_selection_required"\` 和 \`candidates\`。
- 收到 candidates 后，选一个 dashboardUuid，再带上它重试。
- 不依赖看板上下文时，不传 dashboardUuid 也会直接查数。

## 何时使用
- Explorer「复制 Metric Query」后原样或小幅修改（改类目、品牌、周期等）
- filters.dimensions.and 多条件、复杂 sorts、tableCalculations

## 何时不要用
- 仅 1~2 维度 + 1 指标 + 极简 filters → run_metric_query（扁平顶层参数）

## 参数（与 run_sql 同级）
- metricQuery（必填，string）：Explorer Metric Query JSON 字符串（可含 optional dashboardUuid）
- projectUuid（可选）、dashboardUuid（可选，覆盖 JSON 内字段）、limit（可选，覆盖 JSON 内 limit）、invalidateCache、full
- valueFormat（可选）：\`raw\`（默认，扁平 CSV/rows 用 API 原值）或 \`formatted\`（Explorer 展示值）；与 full 正交：full 控制是否返回嵌套 rows + fields + warnings

## 工具调用形状
run_semantic_metric_query({
  projectUuid: "<可选>",
  metricQuery: "{\\"dashboardUuid\\":\\"<可选>\\",\\"exploreName\\":\\"...\\",\\"dimensions\\":[...],\\"metrics\\":[...],\\"filters\\":{...},\\"limit\\":500}"
})

错误示例：run_semantic_metric_query({ exploreName, dimensions, metrics, filters })
错误示例：run_metric_query({ metricQuery: "..." })

## 错误处理
- status=dashboard_selection_required：不是失败；从 candidates 选 dashboardUuid 后重试
- 422/4xx：Lightdash API 校验失败，按返回信息改 metricQuery 后重试
- 401/403：检查 PAT 与项目权限
- xxx.filter is not a function：通常是把 Explorer JSON 传给了 run_metric_query`;
