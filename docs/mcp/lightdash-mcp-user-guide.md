# Lightdash MCP 用户使用说明（分析师版）

面向分析师、运营、业务同学。目标：**少记工具名，直接拿结果**。

接入 / Session / 开发配置请看：[文档索引](./README.md) · [标准客户端用法](./lightdash-mcp-client-usage.md)。

---

## 1. 原则

**先找现成图表；找不到再做自定义查询。**

1. 找项目：`list_projects`（多项目时在提问里带项目名或 `projectUuid`）
2. 找图表/看板：`find_charts` / `find_dashboards` / `find_content`
3. 跑图表：`run_saved_chart`
4. 必要时才自定义：`run_metric_query` / `run_semantic_metric_query`

---

## 2. 工具一览（口语）

| 工具 | 什么时候用 |
|------|------------|
| `list_projects` | 不知道该选哪个项目 |
| `find_charts` / `find_dashboards` / `find_content` | 按关键词找图/看板；结果带 `webUrl` |
| `list_spaces` → `list_dashboards` → `list_charts` | 已知空间/看板时的层级浏览 |
| `get_saved_chart` | 看图表参数、数据主题 |
| `run_saved_chart` | 跑已保存图表出数 |
| `list_explores` / `find_explores` / `find_fields` | 找数据主题与字段 ID |
| `run_semantic_metric_query` | Explorer 复制整段 Metric Query（AI 主路径） |
| `run_metric_query` | 1～2 维 + 1 指标的简单扁平查询 |
| `get_site_info` / `get_lightdash_version` | 看站点与版本 |

完整参数与工具数量以 [包 README](../../packages/lightdash-mcp/README.md) 为准。  
查询选型见 [查询工具速查](./lightdash-mcp-query-tools-quickref.md)。

---

## 3. 三种常见场景

### A. 看某张图 / 某个看板的数据

- “帮我找价格指数相关图表，并给我最近 12 个月数据”

系统会：搜索内容 → 读参数 → 跑图 → 出结论。

### B. 没有现成图表，临时分析

- “按四级类目看商品数 Top10”

系统会：选 explore → 找字段 → 筛选排序 → 返回结果。

### C. 查明细 / 高级

复杂筛选或 Explorer JSON 走 `run_semantic_metric_query`；简单条件用 `run_metric_query`。

---

## 4. 提问模板

### 查图表

“在项目 `<项目名或 projectUuid>` 中，查 `<主题>` 的已保存图表，返回 `<时间范围>` 的关键结论和 3 个核心数字。”

### 临时分析

“在项目 `<projectUuid>` 中，按 `<维度>` 分析 `<指标>`，筛选 `<条件>`，返回 Top `<N>`，并解释口径。”

### 逐步下钻

“先给总览，再给 Top10，再下钻到品牌/品类，不要一次返回太大结果。”

---

## 5. FAQ

**字段错误？** 维度/指标搞反或口径不对；让系统先核对 `find_fields`。  
**查询慢？** 先缩小范围（Top50、近 12 个月）。  
**筛选失败？** 先单条件 equals，再叠加。  
**要记住很多工具吗？** 不用；按「先图表、后自定义」提问即可。  
**多项目 / 多环境？** 提问里写清项目；自动化场景应显式传 `projectUuid`。

---

## 6. 团队工作流

1. 先业务问题，不先堆技术参数  
2. 先结论，再明细  
3. 先小范围验证，再放大  
4. 失败时换路径，不要重复同一句  

最小必填：项目、时间范围、分析目标、类目层级（不填时有 `cls_4` 用四级，否则用最细可用类目）。

更细的团队约定可直接写在 Skills / 对话口令里；工具选型见 [查询工具速查](./lightdash-mcp-query-tools-quickref.md)。

---

## 7. 可复制口令

> 你是我的 Lightdash 数据助手。  
> 优先帮我找现成图表并直接出结论；找不到再做自定义查询。  
> 输出顺序：结论 → 关键数字 → 口径说明。  
> 先小范围快速返回；多项目时确认 projectUuid。

---

## 8. 相关文档

- [文档索引](./README.md)
- [标准客户端用法](./lightdash-mcp-client-usage.md)
- [查询工具速查](./lightdash-mcp-query-tools-quickref.md)
- [Skills](../lightdash-mcp-skills/README.md)
