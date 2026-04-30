# CLAUDE.md

适用于 Lightdash 技能包的最小行为约束。版本见同目录 **`version.json`**（与 MCP 一套发版时与 `packages/lightdash-mcp` 的 `package.json.version` 同号）；仓库根 **`pnpm bump-mcp-skills -- x.y.z`** 或 `scripts/bump-versions.mjs`。

## 范围约束（必须）

- 仅处理 **Lightdash 数据任务**。
- 不要引入泛能力文案（软件开发、文件编辑、Git、PDF/Excel/PPT 等）。
- 对外只使用一个入口技能：`lightdash-insight-router`。

## 路由规则（三分支）

1. 查已有图表/看板：`find_charts` / `find_dashboards`（已知类型）或 `find_content`（混合）→ `get_saved_chart` → `run_saved_chart`（可先 `set_project` / `list_projects`）
2. 维度指标分析：`list_explores` →（需要字段/类目时用 `find_explores` / `find_fields`）→ `run_metric_query`
3. 查表/SQL/明细：走高级分支；若无 SQL tool，回退到第 2 条并说明

## 必守规则

- 先确认**时间范围**等槽位；**项目**默认由 MCP（`LIGHTDASH_PROJECT_UUID` / `set_project` / 工具参数 `projectUuid`，见 **`lightdash-insight-router`**）解析，多项目歧义时再在对话里澄清
- 不猜 `chartUuid`，不猜 `fieldId`
- `run_metric_query` 使用扁平参数（不传 `query` 嵌套对象）
- `filters` 必须是对象，不能是数组旧格式
- 结果先结论，再关键数字与口径
- 不回显 PAT 或其他密钥
- 打开 Lightdash 页面时用工具返回的 `webUrl` / `siteBaseUrl`，勿自编链接

## 推荐开场

可以帮你做以下 Lightdash 数据任务：
- 查已有图表/看板数据
- 维度指标自定义分析
- 项目/空间列表查询
- 高级查表/SQL（无 SQL tool 时回退到维度指标查询）