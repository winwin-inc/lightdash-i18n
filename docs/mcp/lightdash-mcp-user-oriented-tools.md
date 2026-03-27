# Lightdash MCP：给分析师用的工具说明

面向**业务分析 / 报表阅读**，不追求 API 细节。MCP 已注册的工具如下（按推荐顺序）。

---

## 1. 工具一览

| 工具 | 什么时候用 |
|------|------------|
| `lightdash_list_projects` | 不知道当前该选哪个项目时，先看有权限的项目列表。 |
| `lightdash_search_content` | 按关键词找**看板、已保存图表、空间**；可配合 `contentTypes`：`chart` / `dashboard` / `space`。 |
| `lightdash_list_spaces` | 看当前项目下有哪些**空间（文件夹）**。 |
| `lightdash_get_saved_chart` | 已知道图表 ID，想看**名称、参数怎么填、用的哪个数据主题**。 |
| `lightdash_run_saved_chart` | 跑**已保存图表**出数；用 `parameters` 改筛选（如年份）；`limit` 会按环境自动封顶。 |
| `lightdash_list_explores` | 列的是**数据主题（模型）**，不是已保存图表名。 |
| `lightdash_get_explore` | 看某个数据主题里有哪些**维度和指标（字段 ID）**。 |
| `lightdash_run_metric_query` | **高级**：自己拼维度、指标、筛选；需先 `get_explore` 拿到字段 ID。 |

日常优先用**前五项**；后三项适合临时探索或复杂自定义查询。

---

## 2. 典型用法（口语化）

1. **找东西**：`list_projects`（若需要）→ `search_content` 搜「销售」「驾驶舱」等。  
2. **跑一张现成的图**：`search_content` 得到 `chartUuid` → 可先 `get_saved_chart` 看参数 → `run_saved_chart`。  
3. **自己从数据里拖维度/指标**：`list_explores` → `get_explore` → `run_metric_query`。

---

## 3. Skills 简化建议（合并 router，面向非技术人员）

可以简化。目标是让用户只记住「一个入口技能」，由 router 自动分流。

建议结构：

| 目录 | 保留建议 | 说明 |
|------|----------|------|
| `lightdash-insight-router` | **保留并作为唯一入口** | 非技术用户只需要它；负责识别意图并调用对应 MCP tools。 |
| `lightdash-data-tools` | **合并到 `lightdash-insight-router`** | 建议并入，减少“要选哪个技能”的负担。 |
| `lightdash-metric-query` | 作为 router 的「高级分支」 | 不再单独面向普通用户展示；由 router 在需要时自动进入。 |

最小可用方案（推荐，三种模式）：

- 对外只暴露一个名称：`lightdash-insight-router`
- 在 router 内部处理三类需求：
  - **查已有内容**：看板 / 图表 / 空间
  - **维度指标分析**：先跑保存图表；没有保存图再走 `list_explores -> get_explore -> run_metric_query`
  - **SQL/表查询（高级）**：基于表结构或 SQL 模板取数（类似 `lightdash-charts-viewer` 这类处理链路）
- `lightdash-metric-query` 与 SQL 查询能力统一归到 router 的「高级模式」里

推荐路由规则（router 内部）：

1. 用户提到「看板/图表/报表/驾驶舱」→ 优先内容检索与保存图表执行  
2. 用户提到「按维度/指标分析」→ 走 explore + metric query  
3. 用户提到「查表、SQL、明细、原始数据」→ 走 SQL/表查询分支（高级）

---

## 4. 推荐接话（可直接复制）

给 Claude 的统一接话（非技术用户）：

> 你是我的 Lightdash 数据助手。请优先用业务方式帮我拿结果，不要先讲技术细节。  
> 我的需求只有两类：  
> 1) 查已有图表/看板的数据；  
> 2) 没有现成图表时，直接从数据模型查结果。  
>  
> 工作规则：  
> - 先确认项目与时间范围；  
> - 优先走已保存图表（search -> get_saved_chart -> run_saved_chart）；  
> - 找不到现成图表再走 explore 查询（list_explores -> get_explore -> run_metric_query）；  
> - 当用户明确要查表/SQL/明细时，进入 SQL 或表查询高级模式；  
> - 输出要简洁，先给结论，再给关键数字与口径。  

建议在 `lightdash-insight-router/SKILL.md` 里将这段作为默认行为说明，减少用户反复提示。

---

## 5. 认证（与工具无关）

- **stdio**：客户端 `env` 或 `packages/lightdash-mcp/.env` 中配置 `LIGHTDASH_API_KEY` 等。  
- **HTTP**：客户端 `headers`：`x-api-key: <PAT>`。

---

## 6. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-27 | 初版：语义化工具矩阵与路由 |
| 2026-03-27 | 精简为分析师向；补充 `list_spaces`、`get_saved_chart` 与工具顺序说明 |
| 2026-03-27 | 增加 skills 简化方案与统一接话模板 |
| 2026-03-27 | 合并 router：补充 SQL/表查询高级场景与三分支路由 |
