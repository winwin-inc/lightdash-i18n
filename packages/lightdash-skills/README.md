# @lightdash/skills

给 Claude Code 使用的 Lightdash 技能包（SKILL 文档集合）。

## 版本（建议与 MCP 同号）

本包**不设 npm `package.json`**。对外版本写在 **[`version.json`](./version.json)**（`version` + `updatedAt`）。若技能与自建 **Lightdash MCP** 一套发版，**建议两者使用相同版本号**，便于对照与排查。`version.json` 也便于分发与后续「检测更新」类流程。

在本仓库内与 MCP 包同步改版本、或生成**对外分发 zip** 时，见 **[MAINTAINERS.md](./MAINTAINERS.md)**（内含「打包」一节）。

布局：根目录含 **`version.json`**、[`CLAUDE.md`](./CLAUDE.md)、[`MAINTAINERS.md`](./MAINTAINERS.md)（维护者可选）；三个子目录各含 `SKILL.md`（router 另有 `ROUTER-SOP.md`）；`lightdash-chart-semantics/resources/` 含 [`mcp-response-mapping.md`](./lightdash-chart-semantics/resources/mcp-response-mapping.md)、[`chart-families-mcp.md`](./lightdash-chart-semantics/resources/chart-families-mcp.md)。**不需要**再套一层 `skills/`；使用方项目根配置 `.claude` / `.mcp.json`。

## 与 MCP 的关系

- Skills 只描述**怎么问、工具顺序与排障**；不承载 **MCP 服务端环境变量** 或完整连接说明（连接方式由部署方文档与客户端配置提供）。
- 客户端侧模板：[`.mcp.json.example`](./.mcp.json.example)（通常仅 `url` + `headers`）。
- **工具名与参数**以当前连接的 MCP **`tools/list`** 及实际返回 JSON 为准（勿硬编码过时工具名）。
- 工具可选参数 **`projectUuid`** 及解析顺序见 **[`lightdash-insight-router/SKILL.md`](./lightdash-insight-router/SKILL.md)**。

## Claude 授权（避免反复弹窗）

本包内已提供 [`./.claude/settings.json`](./.claude/settings.json)：

- `enableAllProjectMcpServers: true`
- `permissions.allow: ["mcp__lightdash__*"]`

这表示：自动启用 `.mcp.json` 中的 lightdash 服务，并默认允许该服务全部 tools。

## 当前技能

- **[`lightdash-insight-router/SKILL.md`](./lightdash-insight-router/SKILL.md)**：唯一入口；完整门禁见 **[`ROUTER-SOP.md`](./lightdash-insight-router/ROUTER-SOP.md)**。
- **[`lightdash-metric-query/SKILL.md`](./lightdash-metric-query/SKILL.md)**：高级 `run_semantic_metric_query` / `run_metric_query` 与 **[`QUERY-CHECKLIST.md`](./lightdash-metric-query/QUERY-CHECKLIST.md)**。
- **[`lightdash-chart-semantics/SKILL.md`](./lightdash-chart-semantics/SKILL.md)**：图表语义与 MCP 返回解读。

## 使用约定

- 提数优先使用当前 MCP 暴露的工具（例如 `find_charts`、`find_content`、`run_semantic_metric_query`、`run_metric_query`、`get_site_info`、`get_saved_chart` 等，以 **`tools/list`** 为准）；内容类结果中的 `webUrl` 以工具返回值为准。
- 不在技能正文写明文密钥。
- 能先跑保存图表就先跑保存图表；需要自定义再走 explore + metric query。

## 文档语言约定

- **中文说明 + 英文标识符：** 规则、门禁、排障用中文；MCP **工具名**、JSON **字段名**、`chartConfig.type`、字段 id、错误码等与 **`tools/list`** / 请求体一致，不翻译。`description` 以中文为主，可括号补英文触发词。
