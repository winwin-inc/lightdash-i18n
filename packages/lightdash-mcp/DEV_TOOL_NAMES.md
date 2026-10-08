# MCP tool names

> 共 **26** 个工具；与当前包内 MCP 注册一致。

- Core-like count: **18**
- Extension (site/chart helpers) count: **8**

## All tools (sorted)

- `find_charts`
- `find_content`
- `find_dashboards`
- `find_explores`
- `find_fields`
- `find_spaces`
- `get_current_project`
- `get_lightdash_version`
- `get_mcp_docs`
- `get_my_access`
- `get_saved_chart`
- `get_dashboard_code`
- `get_dashboard_tiles`
- `get_site_info`
- `list_dashboards`
- `list_charts`
- `list_explores`
- `list_projects`
- `list_spaces`
- `list_verified_content`
- `run_metric_query`
- `run_semantic_metric_query`
- `run_saved_chart`
- `run_dashboard_tiles`
- `search_field_values`
- `set_project`

## Extension tools

- `get_saved_chart`
- `get_dashboard_code`
- `get_dashboard_tiles`
- `get_site_info`
- `list_charts`
- `list_spaces`
- `run_dashboard_tiles`
- `run_saved_chart`

## Notes

- `get_mcp_docs` 返回内置静态使用说明（overview / query_workflow / content_fields / session_lifecycle / security），不读本地 `docs/mcp`、不访问远程 URL、不接受密钥。字段约定（`chartKind` / `groups`）见 `content_fields`。
- `get_my_access` 返回当前 PAT 的组织角色和各项目有效能力。默认不返回 `explores`；`includeExplores=true` 才返回 `queryable` / `metadataOnly` / `attributeDenied`，建议同时传 `projectUuid`。设计见 `docs/mcp/mcp-get-my-access.md`。
- `get_dashboard_tiles` / `run_dashboard_tiles` / `get_dashboard_code` 为本包扩展能力，不属于上游 EE 内置 MCP 工具集。
- 多数列表与查询工具默认返回精简结构（认图用 `chartKind`）；`get_saved_chart` 默认同时含 `chartKind` 与 `chartType`（=`chartConfig.type`）；传 `full: true` 返回完整字段。
