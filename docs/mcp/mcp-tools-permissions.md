# MCP 工具与权限对照

组织角色和项目角色会叠加。下面按「组织角色是成员」来写：能不能调用，看该项目上的项目角色。

项目角色从低到高：查看者 `viewer`、交互式查看者 `interactive_viewer`、编辑者 `editor`、开发者 `developer`、管理员 `admin`。更高角色包含更低角色的能力。

| 中文 | 英文 | 代码值 |
|---|---|---|
| 成员 | Member | `member` |
| 查看者 | Viewer | `viewer` |
| 交互式查看者 | Interactive Viewer | `interactive_viewer` |
| 编辑者 | Editor | `editor` |
| 开发者 | Developer | `developer` |
| 管理员 | Admin | `admin` |

「成员」只存在于组织角色。项目角色从「查看者」起。

## 工具与最低项目角色

组织角色为成员时，达到该列角色即可调用。更高角色同样可以。

| 工具 | 最低项目角色 |
|---|---|
| `get_mcp_docs` | 无，PAT 认证即可 |
| `get_site_info` | 无，PAT 认证即可 |
| `get_lightdash_version` | 无，PAT 认证即可 |
| `set_project` | 无，PAT 认证即可 |
| `get_current_project` | 无，PAT 认证即可 |
| `get_my_access` | 无，PAT 认证即可 |
| `list_projects` | 查看者 |
| `list_spaces` | 查看者 |
| `find_spaces` | 查看者 |
| `find_content` | 查看者 |
| `find_dashboards` | 查看者 |
| `list_dashboards` | 查看者 |
| `find_charts` | 查看者 |
| `get_saved_chart` | 查看者 |
| `get_dashboard_tiles` | 查看者 |
| `list_charts` | 查看者 |
| `run_saved_chart` | 查看者 |
| `run_dashboard_tiles` | 查看者 |
| `list_explores` | 查看者 |
| `find_explores` | 查看者 |
| `find_fields` | 查看者 |
| `search_field_values` | 查看者 |
| `list_verified_content` | 查看者 |
| `run_metric_query` | 交互式查看者 |
| `run_semantic_metric_query` | 交互式查看者 |
| `get_dashboard_code` | 编辑者 |

## 不查 Lightdash 权限的工具

这些工具只要求 MCP 请求本身已通过 PAT 认证。

| 工具 | 作用 |
|---|---|
| `get_mcp_docs` | 返回 MCP 内置说明 |
| `get_site_info` | 返回站点根地址 |
| `get_lightdash_version` | 返回实例健康信息与版本 |
| `set_project` | 在当前 PAT 会话里记住默认项目 |
| `get_current_project` | 读取当前会话里的默认项目 |
| `get_my_access` | 返回当前令牌的组织角色、各项目有效能力和可查表。设计见 [mcp-get-my-access.md](./mcp-get-my-access.md) |

## 查看者即可

能看该用户有权访问的空间、看板和已保存图表。公开内容，或空间访问列表里有该用户的内容，可以读到。私有且未授权的空间读不到。

| 工具 | 作用 | 主程序检查 |
|---|---|---|
| `list_projects` | 列出当前 PAT 能访问的项目 | 只返回有项目成员身份的项目 |
| `list_spaces` | 列出项目下的空间 | `view Space` |
| `find_spaces` | 按关键词搜索空间 | `view Space` |
| `find_content` | 混合搜索图表、看板、空间 | `view SavedChart` / `view Dashboard` / `view Space` |
| `find_dashboards` | 按关键词搜索看板 | `view Dashboard` |
| `list_dashboards` | 按空间列出看板 | `view Dashboard` |
| `find_charts` | 按关键词搜索已保存图表 | `view SavedChart` |
| `get_saved_chart` | 读取已保存图表元数据 | `view SavedChart` |
| `get_dashboard_tiles` | 读取看板磁贴布局 | `view Dashboard` |
| `list_charts` | 列出看板内的已保存图表磁贴 | `view Dashboard` |
| `run_saved_chart` | 按已保存图表跑数 | `view SavedChart` 且 `view Project` |
| `run_dashboard_tiles` | 批量跑看板内已保存图表 | `view SavedChart` 且 `view Project` |
| `list_explores` | 列出项目 explores | `view Project` |
| `find_explores` | 在数据目录里搜索 explore | `view Project` |
| `find_fields` | 在指定 explore 内找字段 | `view Project` |
| `search_field_values` | 搜索维度取值 | 字段搜索接口按 `view Project`；回退到临时指标查询时改为下面的交互式查看者 |

`list_verified_content` 调用已验证内容接口。这个站点版本不一定提供该接口，失败原因是版本，不是角色。

## 交互式查看者

在查看者之上，增加临时指标查询。检查的是该项目上的 `view Explore`；`manage Explore` 包含这项。

| 工具 | 作用 | 主程序检查 |
|---|---|---|
| `run_metric_query` | 扁平临时指标查询 | `view Explore` |
| `run_semantic_metric_query` | 整段 Metric Query 临时查询 | `view Explore` |

组织保持成员、项目改为交互式查看者时，上面两组工具都可以用。范围只限这个项目。

## 编辑者

| 工具 | 作用 | 主程序检查 |
|---|---|---|
| `get_dashboard_code` | 导出看板 as-code 配置 | `view ContentAsCode` |

交互式查看者调用 `get_dashboard_code` 会被拒绝。
