/** MCP tool description for run_semantic_metric_query (AI-first, Explorer JSON passthrough). */
export const RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION = `【语义 Metric Query】执行 Explorer 复制的整段 Metric Query（v2 异步 + 轮询，首选 CSV）。

## 强制规则（违反会报错或查不出数）
1. 必须用本工具 run_semantic_metric_query，不要用 run_metric_query 承载整段 Explorer JSON。
2. metricQuery 为 **JSON 字符串**：Explorer「复制 Metric Query」后整段粘贴，禁止拆成键值对或平铺到工具顶层。
3. dimensions、metrics 在 JSON 内必须是字符串数组，禁止写成单个字符串。
4. 改筛选只改 filters.dimensions.and[i].values；保留 target.fieldId、operator、id；类目文案须与 Explorer 下拉完全一致。
5. 空 tableCalculations / additionalMetrics / customDimensions / metricOverrides 可省略（传空 []/{} 也会自动去掉）。
6. 需要项目时：metricQuery JSON 可含 projectUuid；也可用顶层 projectUuid 或环境变量 LIGHTDASH_PROJECT_UUID（顶层参数优先于 JSON 内字段）。

## 分页（重要）
- 行分页用 **limit + offset**：可写在 metricQuery JSON 内，也可用顶层 limit / offset 覆盖 JSON。
- 客户端可按 limit 固定、offset 递增循环拉取；不要用 page / pageSize 做查数翻页。
- pageSize（若出现）仅异步结果拉取块大小，服务端会收齐，可忽略。

## 项目上下文 projectUuid
- 已知项目时传 projectUuid；可放在 metricQuery JSON 内，也可用顶层参数（顶层优先）。
- 未传时回退环境变量 LIGHTDASH_PROJECT_UUID。

## 看板上下文 dashboardUuid
部分 explore 依赖 dashboardSlug。
- 已知看板时传 dashboardUuid；可放在 metricQuery JSON 内，也可用顶层参数（顶层优先）。
- 未传且需要看板上下文时：反查仅 1 个关联看板则自动选用并查数；多个关联看板时返回 \`dashboard_selection_required\` + \`candidates\`，选一个后重试。
- 不依赖看板上下文时，不传 dashboardUuid 也会直接查数。

## 何时使用
- Explorer「复制 Metric Query」后原样或小幅修改（改类目、品牌、周期等）
- filters.dimensions.and 多条件、复杂 sorts、tableCalculations

## 何时不要用
- 仅 1~2 维度 + 1 指标 + 极简 filters → run_metric_query（扁平顶层参数）

## 参数
- metricQuery（必填，string）：Explorer Metric Query JSON 字符串（可含 optional projectUuid / dashboardUuid / limit / offset）
- projectUuid（可选，覆盖 JSON 内字段）、dashboardUuid（可选，覆盖 JSON 内字段）、limit / offset（可选，覆盖 JSON）、invalidateCache、full
- valueFormat（可选）：\`raw\`（默认）或 \`formatted\`；与 full 正交

## 工具调用形状
run_semantic_metric_query({
  projectUuid: "<可选，优先于 JSON>",
  limit: 2000,
  offset: 0,
  metricQuery: "{\"exploreName\":\"...\",\"dimensions\":[...],\"metrics\":[...],\"filters\":{...},\"limit\":500,\"offset\":0}"
})

错误示例：run_semantic_metric_query({ exploreName, dimensions, metrics, filters })
错误示例：run_metric_query({ metricQuery: "..." })

## 错误处理
- status=dashboard_selection_required：多候选时出现；从 candidates 取 dashboardUuid 后重试（唯一候选已自动选用）
- 422/4xx：Lightdash API 校验失败，按返回信息改 metricQuery 后重试
- 401/403：检查 PAT 与项目权限
- xxx.filter is not a function：通常是把 Explorer JSON 传给了 run_metric_query
`;
