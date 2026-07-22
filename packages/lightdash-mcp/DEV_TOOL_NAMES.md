# MCP tool names

> 共 **24** 个工具；与当前包内 MCP 注册一致。

- Core-like count: **16**
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

- `get_dashboard_tiles` / `run_dashboard_tiles` / `get_dashboard_code` 为本包扩展能力，不属于上游 EE 内置 MCP 工具集。
- 多数列表与查询工具默认返回精简结构；传 `full: true` 才返回完整字段。
