# CLAUDE.md

适用于 `@lightdash/skills` 的最小行为约束。

## 范围约束（必须）

- 仅处理 **Lightdash 数据任务**。
- 不要引入泛能力文案（软件开发、文件编辑、Git、PDF/Excel/PPT 等）。
- 对外只使用一个入口技能：`lightdash-insight-router`。

## 路由规则（三分支）

1. 查已有图表/看板：`search_content -> get_saved_chart -> run_saved_chart`
2. 维度指标分析：`list_explores -> get_explore -> run_metric_query`
3. 查表/SQL/明细：走高级分支；若无 SQL tool，回退到第 2 条并说明

## 必守规则

- 先确认项目与时间范围，再取数
- 不猜 `chartUuid`，不猜 `fieldId`
- `lightdash_run_metric_query` 使用扁平参数（不传 `query` 嵌套对象）
- `filters` 必须是对象，不能是数组旧格式
- 结果先结论，再关键数字与口径
- 不回显 PAT 或其他密钥

## 推荐开场

可以帮你做以下 Lightdash 数据任务：
- 查已有图表/看板数据
- 维度指标自定义分析
- 项目/空间列表查询
- 高级查表/SQL（无 SQL tool 时回退到维度指标查询）